import axios from 'axios'
import { ChainInfo } from '@safe-global/safe-apps-sdk'

enum PROVIDER {
  SOURCIFY = 1,
  GATEWAY = 2,
  BLOCKSCOUT_V2 = 3,
  SCANAPI = 4,
  ZKSYNC = 5,
  MODERATO = 6,
  SUBSCAN = 7,
  XFISCAN = 8,
}

type SourcifyResponse = {
  name: string
  path: string
  content: string
}

const GATEWAY_BASE_URL = process.env.REACT_APP_GATEWAY_BASE_URL

const METADATA_FILE = 'metadata.json'
const DEFAULT_TIMEOUT = 10000

const getProviderURL = (
  chain: string,
  address: string,
  urlProvider: PROVIDER,
  scanAPI?: { link: string; apiKey?: string },
): string => {
  switch (urlProvider) {
    case PROVIDER.SOURCIFY:
      return `https://sourcify.dev/server/files/${chain}/${address}`
    case PROVIDER.GATEWAY:
      return `${GATEWAY_BASE_URL}/v1/chains/${chain}/contracts/${address}`
    case PROVIDER.XFISCAN:
      return `${scanAPI?.link}/api/1.0/verify-contract?chainid=${chain}&module=contract&action=getabi&address=${address}`
    case PROVIDER.MODERATO:
      return `${scanAPI?.link}/v2/contract/${chain}/${address}`
    case PROVIDER.SUBSCAN:
      return `${scanAPI?.link}/api/scan/contracts/info`
    case PROVIDER.ZKSYNC:
      return `${scanAPI?.link}/api?module=contract&action=getabi&address=${address}`
    case PROVIDER.BLOCKSCOUT_V2:
      return `${scanAPI?.link}/api/v2/smart-contracts/${address}`
    case PROVIDER.SCANAPI:
      /** @notice adding chainid for compatibility with Etherscan V2 API */
      return `${scanAPI?.link}/api?chainid=${chain}&module=contract&action=getabi&address=${address}&apikey=${scanAPI?.apiKey}`
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

  // Extract explorer API URL from chain info
  const explorerApiUrl = chainInfo?.blockExplorerUriTemplate?.api
  if (!explorerApiUrl) {
    throw new Error(`No explorer API URL found in Gateway response for chainId ${chainId}`)
  }

  // Get API key from environment if available (for Etherscan detection)
  const apiKey = process.env.REACT_APP_ETHERSCAN_API_KEY

  const abi = await Promise.any([
    // Blockscout V2 API
    (async () => {
      const { data } = await axios.get(
        getProviderURL(chainId, address, PROVIDER.BLOCKSCOUT_V2, { link: explorerApiUrl }),
        {
          timeout: DEFAULT_TIMEOUT,
        },
      )
      if (data && data.abi) {
        return data.abi
      }
      throw new Error('Blockscout V2: Contract found but ABI is missing')
    })(),

    // Etherscan API
    (async () => {
      const { data } = await axios.get(
        getProviderURL(chainId, address, PROVIDER.SCANAPI, { link: explorerApiUrl, apiKey }),
        {
          timeout: DEFAULT_TIMEOUT,
        },
      )
      if (data && data.message === 'OK' && data.result) {
        return JSON.parse(data.result)
      }
      throw new Error('Etherscan: Contract found but ABI is missing')
    })(),

    // ZkSync API
    (async () => {
      const { data } = await axios.get(
        getProviderURL(chainId, address, PROVIDER.ZKSYNC, { link: explorerApiUrl }),
        {
          timeout: DEFAULT_TIMEOUT,
        },
      )
      if (data && data.message === 'OK' && data.result) {
        return JSON.parse(data.result)
      }
      throw new Error('ZKSync: Contract found but ABI is missing')
    })(),

    // Subscan API
    (async () => {
      const { data } = await axios.post(
        getProviderURL(chainId, address, PROVIDER.SUBSCAN, { link: explorerApiUrl }),
        { contract: address },
        { timeout: DEFAULT_TIMEOUT },
      )
      if (data && data.message === 'Success' && data.abi) {
        return data.abi
      }
      throw new Error('Subscan: Contract found but ABI is missing')
    })(),

    // XFIScan API
    (async () => {
      const { data } = await axios.get(
        getProviderURL(chainId, address, PROVIDER.XFISCAN, { link: explorerApiUrl }),
        {
          timeout: DEFAULT_TIMEOUT,
        },
      )
      if (data && data.message === 'OK' && data.result) {
        return JSON.parse(data.result)
      }
      throw new Error('XFIScan: Contract found but ABI is missing')
    })(),

    // Moderato API
    (async () => {
      const { data } = await axios.get(
        getProviderURL(chainId, address, PROVIDER.MODERATO, { link: explorerApiUrl }),
        {
          timeout: DEFAULT_TIMEOUT,
        },
      )
      if (data && data.abi) {
        return data.abi
      }
      throw new Error('Moderato: Contract found but ABI is missing')
    })(),
  ])

  return abi
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
