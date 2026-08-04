import axios from 'axios'
import { ChainInfo } from '@safe-global/safe-apps-sdk'
import { ChainInfo as GatewayChainInfo } from '@safe-global/safe-gateway-typescript-sdk'
import { hasFeature, FEATURES } from '../utils'
import { hexToTronRawHex } from '../utils/tronAddress'
import { tronAbiEntrysToAbi } from './tronAbi'

enum PROVIDER {
  SOURCIFY = 1,
  GATEWAY = 2,
}

type SourcifyResponse = {
  name: string
  path: string
  content: string
}

const GATEWAY_BASE_URL = process.env.REACT_APP_GATEWAY_BASE_URL

const METADATA_FILE = 'metadata.json'
const DEFAULT_TIMEOUT = 10000

const getProviderURL = (chain: string, address: string, urlProvider: PROVIDER): string => {
  switch (urlProvider) {
    case PROVIDER.SOURCIFY:
      return `https://sourcify.dev/server/files/${chain}/${address}`
    case PROVIDER.GATEWAY:
      return `${GATEWAY_BASE_URL}/v1/chains/${chain}/contracts/${address}`
    default:
      throw new Error('The Provider is not supported')
  }
}

const getAbiFromSourcify = async (address: string, chainId: string): Promise<any> => {
  const { data } = await axios.get<SourcifyResponse[]>(
    getProviderURL(chainId, address, PROVIDER.SOURCIFY),
    {
      timeout: DEFAULT_TIMEOUT,
    },
  )

  if (data.length) {
    const metadata = data.find((item: SourcifyResponse) => item.name === METADATA_FILE)
    return metadata && JSON.parse(metadata.content)?.output?.abi
  }

  throw new Error('Contract found but could not found abi using Sourcify')
}

const getAbiFromGateway = async (address: string, chainName: string): Promise<any> => {
  const { data } = await axios.get(getProviderURL(chainName, address, PROVIDER.GATEWAY), {
    timeout: DEFAULT_TIMEOUT,
  })

  // We need to check if the abi is present in the response because it's possible
  // That the transaction service just stores the contract and returns 200 without querying for the abi
  // (or querying for the abi failed)
  if (data && data.contractAbi?.abi) {
    return data?.contractAbi?.abi
  }

  throw new Error('Contract found but could not found ABI using the Gateway')
}

const replaceTemplate = (uri: string, data: Record<string, string>): string => {
  const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g

  return uri.replace(TEMPLATE_REGEX, (_, key: string) => data[key])
}

const getChainInfoFromGateway = async (chainId: string): Promise<GatewayChainInfo> => {
  try {
    const { data } = await axios.get(`${GATEWAY_BASE_URL}/v1/chains/${chainId}`, {
      timeout: DEFAULT_TIMEOUT,
    })
    return data
  } catch (error) {
    throw new Error(`Failed to fetch chain info from Gateway API for chainId ${chainId}: ${error}`)
  }
}

// Tron keeps a contract's ABI on chain, so the node is an ABI source in its own
// right -- it answers for unverified contracts too, which is what makes ABI
// auto-lookup work on Tron at all: Sourcify has no Tron index, the gateway's
// `/contracts` endpoint returns 503, and Tronscan's API matches none of the
// explorer response shapes `getABIFromScanAPI` understands.
//
// `wallet/getcontract` lives on the node's REST API, which sits alongside the
// JSON-RPC endpoint the chain config advertises.
const getAbiFromTronNode = async (address: string, chainId: string): Promise<any> => {
  const chainInfo = await getChainInfoFromGateway(chainId)

  const isTronChain =
    chainInfo?.nativeCurrency?.symbol === 'TRX' || !!chainInfo?.shortName?.startsWith('trx')
  if (!isTronChain) {
    throw new Error(`Chain ${chainId} is not a Tron chain`)
  }

  const jsonRpcUrl = chainInfo.safeAppsRpcUri?.value || chainInfo.rpcUri?.value
  if (!jsonRpcUrl) {
    throw new Error(`No RPC URI found in Gateway response for chainId ${chainId}`)
  }

  const rawHexAddress = hexToTronRawHex(address)
  if (!rawHexAddress) {
    throw new Error(`Not a Tron address: ${address}`)
  }

  const nodeUrl = jsonRpcUrl.replace(/\/jsonrpc\/?$/, '')
  const { data } = await axios.post(
    `${nodeUrl}/wallet/getcontract`,
    { value: rawHexAddress },
    { timeout: DEFAULT_TIMEOUT },
  )

  const entrys = data?.abi?.entrys
  if (!entrys?.length) {
    // Either the address is not a contract, or it was deployed without its ABI.
    throw new Error('Contract found but it exposes no ABI on chain')
  }

  return tronAbiEntrysToAbi(entrys)
}

const getABIFromScanAPI = async (address: string, chainId: string): Promise<any> => {
  // Fetch chain info from Safe Gateway API
  const chainInfo = await getChainInfoFromGateway(chainId)

  // Extract explorer API URL template from chain info
  const explorerApiUrlTemplate = chainInfo?.blockExplorerUriTemplate?.api
  if (!explorerApiUrlTemplate) {
    throw new Error(`No explorer API URL found in Gateway response for chainId ${chainId}`)
  }

  // Determine which API key to use based on chain feature flags
  const apiKey = hasFeature(chainInfo, FEATURES.SOCIAL_SCAN)
    ? process.env.REACT_APP_SOCIALSCAN_API_KEY
    : hasFeature(chainInfo, FEATURES.CRONOS_ZK_EVM)
    ? process.env.REACT_APP_CRONOS_ZK_EVM_API_KEY
    : hasFeature(chainInfo, FEATURES.CRONOS)
    ? process.env.REACT_APP_CRONOS_API_KEY
    : hasFeature(chainInfo, FEATURES.CRONOS_TESTNET)
    ? process.env.REACT_APP_CRONOS_TESTNET_API_KEY
    : hasFeature(chainInfo, FEATURES.SUBSCAN)
    ? process.env.REACT_APP_SUBSCAN_API_KEY
    : process.env.REACT_APP_ETHERSCAN_API_KEY

  const promises = []

  // Subscan API custom processing
  if (hasFeature(chainInfo, FEATURES.SUBSCAN)) {
    promises.push(
      (async () => {
        const { data } = await axios.post(
          explorerApiUrlTemplate,
          { contract: address },
          {
            timeout: DEFAULT_TIMEOUT,
            headers: { 'x-api-key': apiKey },
          },
        )
        if (data && data.message === 'Success' && data.abi) {
          return data.abi
        }
        throw new Error('Subscan: Contract found but ABI is missing')
      })(),
    )
  }

  // Standard GET request using template replacement
  const scanApiUrl = replaceTemplate(explorerApiUrlTemplate, {
    module: 'contract',
    action: 'getabi',
    address: address,
    apiKey: apiKey!,
    chainId: chainId,
    chainid: chainId, // for compatibility with Etherscan V2 API
  })

  promises.push(
    (async () => {
      const { data } = await axios.get(scanApiUrl, {
        timeout: DEFAULT_TIMEOUT,
      })

      if (data && data.abi) {
        // Blockscout V2 format
        return data.abi
      }
      if (data && data.message === 'OK' && data.result) {
        // Etherscan/ZkSync/XFIScan format
        return JSON.parse(data.result)
      }

      throw new Error('Contract found but ABI is missing')
    })(),
  )

  return await Promise.any(promises)
}

const getAbi = async (address: string, chainInfo: ChainInfo): Promise<any> => {
  let abi
  try {
    abi = await Promise.any([
      getAbiFromSourcify(address, chainInfo.chainId),
      getAbiFromGateway(address, chainInfo.chainId),
      getABIFromScanAPI(address, chainInfo.chainId),
      getAbiFromTronNode(address, chainInfo.chainId),
    ])
  } catch {
    abi = null
  }
  return abi
}

export default getAbi
