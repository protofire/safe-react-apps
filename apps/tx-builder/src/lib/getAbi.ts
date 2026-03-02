import axios from 'axios'
import { ChainInfo } from '@safe-global/safe-apps-sdk'

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

const getABIFromScanAPI = async (address: string, chainId: string): Promise<any> => {
  // Fetch chain info from Safe Gateway API
  let chainInfo: ChainInfo
  try {
    const { data } = await axios.get(`${GATEWAY_BASE_URL}/v1/chains/${chainId}`, {
      timeout: DEFAULT_TIMEOUT,
    })
    chainInfo = data
  } catch (error) {
    throw new Error(`Failed to fetch chain info from Gateway API for chainId ${chainId}: ${error}`)
  }

  // Extract explorer API URL template from chain info
  const explorerApiUrlTemplate = chainInfo?.blockExplorerUriTemplate?.api
  if (!explorerApiUrlTemplate) {
    throw new Error(`No explorer API URL found in Gateway response for chainId ${chainId}`)
  }

  // Get API key from environment (for Etherscan API)
  const apiKey = process.env.REACT_APP_ETHERSCAN_API_KEY

  const promises = []

  // Subscan API
  if (explorerApiUrlTemplate.includes('subscan')) {
    promises.push(
      (async () => {
        const { data } = await axios.post(
          explorerApiUrlTemplate,
          { contract: address },
          { timeout: DEFAULT_TIMEOUT },
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
    ])
  } catch {
    abi = null
  }
  return abi
}

export default getAbi
