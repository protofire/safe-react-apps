import axios from 'axios'
import { ChainInfo } from '@gnosis.pm/safe-apps-sdk'

enum PROVIDER {
  SOURCIFY = 1,
  GATEWAY = 2,
  BLOCKSCOUT = 3,
}

type SourcifyResponse = {
  name: string
  path: string
  content: string
}

const METADATA_FILE = 'metadata.json'
const DEFAULT_TIMEOUT = 10000

const getProviderURL = (chain: string, address: string, urlProvider: PROVIDER): string => {
  switch (urlProvider) {
    case PROVIDER.SOURCIFY:
      return `https://sourcify.dev/server/files/${chain}/${address}`
    case PROVIDER.GATEWAY:
      return getGatewayProvider(chain, address)
    case PROVIDER.BLOCKSCOUT:
      return `https://blockscout.com/${chain}/api?module=contract&action=getabi&address=${address}`
    default:
      throw new Error('The Provider is not supported')
  }
}

const SUPPORTED_CHAINS = {
  ACALA: '787',
  KARURA: '686',
  MANDALA: '595',
  ASTAR: '592',
  BOBABEAM: '1294',
  CRONOS: '25',
  CRONOS_TESTNET: '338',
  HARMONY: '1666600000',
  EVMOS: '9001',
  EVMOS_TESTNET: '9000',
  MOONBEAM: '1284',
  MOONRIVER: '1285',
  MOONBASE: '1287',
  TELOS: '40',
  TELOS_TESTNET: '41',
  VELAS: '106',
  VELAS_TESTNET: '111',
}

const getGatewayProvider = (chain: string, address: string): string => {
  let url: string
  switch (chain) {
    case SUPPORTED_CHAINS.ACALA:
      url = `https://gateway.safe.acala.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.KARURA:
      url = `https://gateway.safe.acala.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.MANDALA:
      url = `https://gateway.safe.acala.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.ASTAR:
      url = `https://gateway.safe.astar.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.BOBABEAM:
      url = `https://gateway.multisig.bobabeam.boba.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.CRONOS:
      url = `https://gateway.cronos-safe.org/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.CRONOS_TESTNET:
      url = `https://gateway.cronos-safe.org/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.EVMOS:
      url = `https://gateway.safe.evmos.org/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.EVMOS_TESTNET:
      url = `https://gateway.safe.evmos.org/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.HARMONY:
      url = `https://gateway.staging-safe.harmony.one/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.MOONBEAM:
      url = `https://gateway.multisig.moonbeam.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.MOONRIVER:
      url = `https://gateway.multisig.moonbeam.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.MOONBASE:
      url = `https://gateway.multisig.moonbeam.network/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.TELOS:
      url = `https://gateway.safe.telos.net/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.TELOS_TESTNET:
      url = `https://gateway.safe.telos.net/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.VELAS:
      url = `https://gateway.velasafe.com/v1/chains/${chain}/contracts/${address}`
      break
    case SUPPORTED_CHAINS.VELAS_TESTNET:
      url = `https://gateway.velasafe.com/v1/chains/${chain}/contracts/${address}`
      break
    default:
      url = `https://safe-client.gnosis.io/v1/chains/${chain}/contracts/${address}`
  }
  return url
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

const getAbiFromBlockscout = async (address: string, chainId: string): Promise<any> => {
  let chainName = ''
  if (chainId === '592') {
    chainName = 'astar'
  } else {
    throw new Error('Unsupported chain')
  }

  const { data } = await axios.get(getProviderURL(chainName, address, PROVIDER.BLOCKSCOUT), {
    timeout: DEFAULT_TIMEOUT,
  })
  // We need to check if the abi is present in the response because it's possible
  // That the transaction service just stores the contract and returns 200 without querying for the abi
  // (or querying for the abi failed)
  if (data && data.message === 'OK' && data.result) {
    return JSON.parse(data.result)
  }

  throw new Error('Contract found but could not found ABI using Blockscout')
}

const getAbi = async (address: string, chainInfo: ChainInfo): Promise<any> => {
  let abi
  try {
    abi = await Promise.any([
      getAbiFromSourcify(address, chainInfo.chainId),
      getAbiFromGateway(address, chainInfo.chainId),
      getAbiFromBlockscout(address, chainInfo.chainId),
    ])
  } catch {
    abi = null
  }
  return abi
}

export default getAbi
