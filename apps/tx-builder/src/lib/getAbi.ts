import axios from 'axios'
import { ChainInfo } from '@safe-global/safe-apps-sdk'

enum PROVIDER {
  SOURCIFY = 1,
  GATEWAY = 2,
  BLOCKSCOUT = 3,
  SCANAPI = 4,
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
      return `${getGatewayBaseUrl(chain)}/v1/chains/${chain}/contracts/${address}`
    case PROVIDER.BLOCKSCOUT:
      const baseApi = getBlockscoutBaseURL(chain)
      return `${baseApi}/api?module=contract&action=getabi&address=${address}`
    case PROVIDER.SCANAPI:
      const scanAPI = getScanAPIBaseURL(chain)
      return `${scanAPI?.link}/api?module=contract&action=getabi&address=${address}&apiKey=${scanAPI?.apiKey}`
    default:
      throw new Error('The Provider is not supported')
  }
}

export enum SUPPORTED_CHAINS {
  ACALA = '787',
  BLAST = '81457',
  BLAST_TESTNET = '168587773',
  BOB = '60808',
  BOB_TESTNET = '111',
  KARURA = '686',
  MANDALA = '595',
  ASTAR = '592',
  SHIDEN = '336',
  SHIBUYA = '81',
  ZKATANA_TESTNET = '1261120',
  BOBABEAM = '1294',
  CASCADIA_TESTNET = '6102',
  CRONOS = '25',
  CRONOS_TESTNET = '338',
  EVMOS = '9001',
  EVMOS_TESTNET = '9000',
  HARMONY = '1666600000',
  HARMONY_TESTNET = '1666700000',
  FLOW_TESTNET = '545',
  HOLESKY = '17000',
  IMMUTABLE = '13371',
  IMMUTABLE_TESTNET = '13473',
  IOTEX = '4689',
  IOTEX_TESTNET = '4690',
  KROMA = '255',
  KROMA_SEPOLIA = '2358',
  LINEA = '59144',
  LINEA_SEPOLIA = '59141',
  LINEA_TESTNET = '59140',
  MANTA_PACIFIC_MAINNET = '169',
  MANTLE = '5000',
  MANTLE_TESTNET = '5001',
  MOONBEAM = '1284',
  MOONRIVER = '1285',
  MOONBASE = '1287',
  NEON_EVM = '245022934',
  NEON_EVM_DEVNET = '245022926',
  NEON_EVM_TESTNET = '245022940',
  OASIS_SAPPHIRE = '23294',
  OASIS_SAPPHIRE_TESTNET = '23295',
  RSK = '30',
  RSK_TESTNET = '31',
  SCROLL = '534352',
  SCROLL_ALPHA_TESTNET = '534353',
  SCROLL_SEPOLIA_TESTNET = '534351',
  SEI = '1329',
  SEI_DEVNET = '713715',
  TANGIBLE_REAL = '111188',
  TANGIBLE_UNREAL = '18233',
  TAIKO = '167000',
  BOBA = '288',
  BOBA_BNB = '56288',
  BOBA_BNB_TESTNET = '9728',
  BOBA_TESTNET = '28882',
  TAIKO_HEKLA = '167009',
  TELOS = '40',
  TELOS_TESTNET = '41',
  TENET = '155',
  TENET_TESTNET = '1559',
  THUNDER_CORE = '108',
  THUNDER_CORE_TESTNET = '18',
  VELAS = '106',
  VELAS_TESTNET = '111',
  ZETACHAIN = '7000',
  ZETACHAIN_TESTNET = '7001',
  ZILLIQA_EVM = '32769',
  ZILLIQA_EVM_TESTNET = '33101',
  ZKLINK_NOVA = '810180',
  ZKLINK_NOVA_GOERLI = '810182',
  ZKSYNC_ERA = '324',
  ZKSYNC_ERA_TESTNET = '280',
  CROSS_FI_TESTNET = '4157',
  WEMIX = '1111',
  WEMIX_TESTNET = '1112',
  XAI = '660279',
  XAI_TESTNET = '37714555429',
  MORPH_HOLESKY = '2810',
  MINT = '185',
}

const getGatewayBaseUrl = (chain: string) => {
  const isProdEnv = process.env?.REACT_APP_IS_PRODUCTION === 'true'

  switch (chain) {
    case SUPPORTED_CHAINS.ACALA:
    case SUPPORTED_CHAINS.KARURA:
    case SUPPORTED_CHAINS.MANDALA:
      return isProdEnv
        ? `https://gateway.safe.acala.network`
        : `https://gateway.staging.safe.acala.network`
    case SUPPORTED_CHAINS.ASTAR:
    case SUPPORTED_CHAINS.SHIDEN:
    case SUPPORTED_CHAINS.SHIBUYA:
    case SUPPORTED_CHAINS.ZKATANA_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.astar.network`
        : `https://gateway.staging-safe.astar.network`
    case SUPPORTED_CHAINS.BLAST:
    case SUPPORTED_CHAINS.BLAST_TESTNET:
      return isProdEnv ? `https://gateway.blast-safe.io` : `https://gateway.blast-safe.io`
    case SUPPORTED_CHAINS.BOB:
    case SUPPORTED_CHAINS.BOB_TESTNET:
      return isProdEnv ? `https://gateway.safe.gobob.xyz` : `https://gateway.staging.safe.gobob.xyz`
    case SUPPORTED_CHAINS.BOBABEAM:
      return isProdEnv
        ? `https://gateway.multisig.bobabeam.boba.network`
        : `https://gateway.staging.multisig.bobabeam.boba.network`
    case SUPPORTED_CHAINS.CASCADIA_TESTNET:
      return `https://gateway.safe.cascadia.foundation`
    case SUPPORTED_CHAINS.CRONOS:
    case SUPPORTED_CHAINS.CRONOS_TESTNET:
      return isProdEnv
        ? `https://gateway.cronos-safe.org`
        : `https://gateway-cronos-safe.crolabs-int.co`
    case SUPPORTED_CHAINS.EVMOS:
    case SUPPORTED_CHAINS.EVMOS_TESTNET:
      return isProdEnv ? `https://gateway.safe.evmos.org` : `https://gateway.safe.evmos.dev`
    case SUPPORTED_CHAINS.HARMONY:
    case SUPPORTED_CHAINS.HARMONY_TESTNET:
      return isProdEnv
        ? `https://gateway.multisig.harmony.one`
        : `https://gateway.staging-safe.harmony.one`
    case SUPPORTED_CHAINS.HOLESKY:
      return isProdEnv
        ? `https://gateway.holesky-safe.protofire.io`
        : `https://gateway.stg.holesky-safe.protofire.io`
    case SUPPORTED_CHAINS.IOTEX:
    case SUPPORTED_CHAINS.IOTEX_TESTNET:
      return isProdEnv ? `https://gateway.safe.iotex.io` : `https://gateway.staging.safe.iotex.io`
    case SUPPORTED_CHAINS.KROMA:
    case SUPPORTED_CHAINS.KROMA_SEPOLIA:
      return isProdEnv
        ? `https://gateway.safe.kroma.network`
        : `https://gateway.staging.safe.kroma.network`
    case SUPPORTED_CHAINS.LINEA:
    case SUPPORTED_CHAINS.LINEA_SEPOLIA:
    case SUPPORTED_CHAINS.LINEA_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.linea.build`
        : `https://gateway.staging.safe.linea.build`
    case SUPPORTED_CHAINS.MANTA_PACIFIC_MAINNET:
      return isProdEnv
        ? `https://gateway.safe.manta.network`
        : `https://gateway.staging.safe.manta.network`
    case SUPPORTED_CHAINS.MANTLE:
    case SUPPORTED_CHAINS.MANTLE_TESTNET:
      return isProdEnv
        ? `https://gateway.multisig.mantle.xyz`
        : `https://gateway.staging.multisig.mantle.xyz`
    case SUPPORTED_CHAINS.MOONBEAM:
    case SUPPORTED_CHAINS.MOONRIVER:
    case SUPPORTED_CHAINS.MOONBASE:
      return isProdEnv
        ? `https://gateway.multisig.moonbeam.network`
        : `https://gateway.staging.multisig.moonbeam.network`
    case SUPPORTED_CHAINS.NEON_EVM:
    case SUPPORTED_CHAINS.NEON_EVM_DEVNET:
    case SUPPORTED_CHAINS.NEON_EVM_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.neonevm.org`
        : `https://gateway.staging.safe.neonevm.org`
    case SUPPORTED_CHAINS.OASIS_SAPPHIRE:
    case SUPPORTED_CHAINS.OASIS_SAPPHIRE_TESTNET:
      return isProdEnv ? `https://gateway.safe.oasis.io` : `https://gateway.safe.stg.oasis.io`
    case SUPPORTED_CHAINS.RSK:
    case SUPPORTED_CHAINS.RSK_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.rootstock.io`
        : `https://gateway.staging.safe.rootstock.io`
    case SUPPORTED_CHAINS.SCROLL:
    case SUPPORTED_CHAINS.SCROLL_ALPHA_TESTNET:
    case SUPPORTED_CHAINS.SCROLL_SEPOLIA_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.scroll.xyz `
        : `https://gateway.staging.safe.scroll.xyz`
    case SUPPORTED_CHAINS.SEI:
    case SUPPORTED_CHAINS.SEI_DEVNET:
      return isProdEnv
        ? `https://gateway.sei-safe.protofire.io`
        : `https://gateway.staging.sei-safe.protofire.io`
    case SUPPORTED_CHAINS.TANGIBLE_REAL:
    case SUPPORTED_CHAINS.TANGIBLE_UNREAL:
      return isProdEnv ? `https://gateway.safe.re.al` : `https://gateway.staging.safe.re.al`
    case SUPPORTED_CHAINS.TELOS:
    case SUPPORTED_CHAINS.TELOS_TESTNET:
      return `https://gateway.safe.telos.net`
    case SUPPORTED_CHAINS.TENET:
    case SUPPORTED_CHAINS.TENET_TESTNET:
      return isProdEnv ? `https://gateway.safe.tenet.org` : `https://gateway.staging.safe.tenet.org`
    case SUPPORTED_CHAINS.THUNDER_CORE:
    case SUPPORTED_CHAINS.THUNDER_CORE_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.thundercore.com`
        : `https://gateway.staging.safe.thundercore.com`
    case SUPPORTED_CHAINS.VELAS:
    case SUPPORTED_CHAINS.VELAS_TESTNET:
      return isProdEnv ? `https://gateway.velasafe.com` : `https://gateway.staging.velasafe.com`
    case SUPPORTED_CHAINS.ZETACHAIN:
    case SUPPORTED_CHAINS.ZETACHAIN_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.zetachain.com`
        : `https://gateway.staging.safe.zetachain.com`
    case SUPPORTED_CHAINS.ZILLIQA_EVM:
    case SUPPORTED_CHAINS.ZILLIQA_EVM_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.zilliqa.com`
        : `https://gateway.staging.safe.zilliqa.com`
    case SUPPORTED_CHAINS.ZKSYNC_ERA:
    case SUPPORTED_CHAINS.ZKSYNC_ERA_TESTNET:
      return isProdEnv
        ? `https://gateway.zksafe.protofire.io`
        : `https://gateway.staging-zksafe.protofire.io`
    case SUPPORTED_CHAINS.CROSS_FI_TESTNET:
      return isProdEnv
        ? 'https://gateway.safe.crossfi.org'
        : 'https://gateway.staging.safe.crossfi.org'
    case SUPPORTED_CHAINS.WEMIX:
    case SUPPORTED_CHAINS.WEMIX_TESTNET:
      return isProdEnv ? 'https://gateway.safe.wemix.com' : 'https://gateway.staging.safe.wemix.com'
    case SUPPORTED_CHAINS.XAI:
    case SUPPORTED_CHAINS.XAI_TESTNET:
      return isProdEnv
        ? `https://gateway.safe-xai.protofire.io`
        : `https://gateway.staging-safe-xai.protofire.io`
    case SUPPORTED_CHAINS.MORPH_HOLESKY:
      return isProdEnv
        ? `https://gateway.safe.morphl2.io`
        : `https://gateway.stg.safe.morphl2.io`
    case SUPPORTED_CHAINS.TAIKO:
    case SUPPORTED_CHAINS.TAIKO_HEKLA:
      return isProdEnv ? 'https://gateway.safe.taiko.xyz' : 'https://gateway.staging.safe.taiko.xyz'
    default:
      throw new Error(
        `[getGatewayBaseUrl]: There is no gateway for ${chain}, therefore we cannot get the contract abi from it.`,
      )
  }
}
// This is a temporary key which will be removed.
const TEMP_MOONRIVER_KEY = 'G5NZZP3M53IYCRKJT7XJCRNJN6XWT9KM7E'

const getScanAPIBaseURL = (chain: string): undefined | { link: string; apiKey?: string } => {
  switch (chain) {
    case SUPPORTED_CHAINS.CASCADIA_TESTNET:
      return { link: 'https://explorer.cascadia.foundation' }
    case SUPPORTED_CHAINS.BLAST:
      return { link: 'https://api.blastscan.io' }
    case SUPPORTED_CHAINS.BLAST_TESTNET:
      return { link: 'https://api-sepolia.blastscan.io' }
    case SUPPORTED_CHAINS.LINEA:
      return {
        link: 'https://api.lineascan.build',
        apiKey: process.env.REACT_APP_LINEASCAN_KEY,
      }
    case SUPPORTED_CHAINS.LINEA_TESTNET:
      return {
        link: 'https://api-testnet.lineascan.build',
        apiKey: process.env.REACT_APP_LINEASCAN_KEY,
      }
    case SUPPORTED_CHAINS.LINEA_SEPOLIA:
      return {
        link: 'https://api-sepolia.lineascan.build',
        apiKey: process.env.REACT_APP_LINEASCAN_KEY,
      }
    case SUPPORTED_CHAINS.HOLESKY:
      return {
        link: 'https://api-holesky.etherscan.io',
        apiKey: process.env.REACT_APP_ETHERSCAN_KEY,
      }
    case SUPPORTED_CHAINS.MOONBEAM:
      return {
        link: 'https://api-moonbeam.moonscan.io',
        apiKey: process.env.REACT_APP_MOONSCAN_KEY,
      }
    case SUPPORTED_CHAINS.MOONBASE:
      return {
        link: 'https://api-moonbase.moonscan.io',
        apiKey: process.env.REACT_APP_MOONSCAN_KEY,
      }
    case SUPPORTED_CHAINS.MOONRIVER:
      return {
        link: 'https://api-moonriver.moonscan.io',
        apiKey: TEMP_MOONRIVER_KEY,
      }
    case SUPPORTED_CHAINS.IMMUTABLE:
      return {
        link: 'https://explorer.immutable.com',
      }
    case SUPPORTED_CHAINS.IMMUTABLE_TESTNET:
      return {
        link: 'https://explorer.testnet.immutable.com',
      }
    case SUPPORTED_CHAINS.ZKLINK_NOVA_GOERLI:
      return {
        link: 'https://goerli.explorer-api.zklink.io',
      }
    case SUPPORTED_CHAINS.ZKLINK_NOVA:
      return {
        link: 'https://explorer-api.zklink.io',
      }
    default:
      return
  }
}

const getBlockscoutBaseURL = (chain: string): string => {
  switch (chain) {
    case SUPPORTED_CHAINS.TANGIBLE_REAL:
      return 'https://explorer.re.al'
    case SUPPORTED_CHAINS.TANGIBLE_UNREAL:
      return 'https://unreal.blockscout.com'
    case SUPPORTED_CHAINS.MINT:
      return 'https://explorer.mintchain.io'    
    case SUPPORTED_CHAINS.BOBA:
    case SUPPORTED_CHAINS.BOBA_BNB:
      return 'https://bobascan.com'
    case SUPPORTED_CHAINS.BOBA_BNB_TESTNET:
    case SUPPORTED_CHAINS.BOBA_TESTNET:
      return 'https://testnet.bobascan.com'
    case SUPPORTED_CHAINS.FLOW_TESTNET:
      return 'https://evm-testnet.flowscan.io'
    default:
      return `https://blockscout.com/${chain}`
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

const getAbiFromGateway = async (address: string, chainId: string): Promise<any> => {
  const { data } = await axios.get(getProviderURL(chainId, address, PROVIDER.GATEWAY), {
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
  const { data } = await axios.get(getProviderURL(chainId, address, PROVIDER.BLOCKSCOUT), {
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

const getABIFromScanAPI = async (address: string, chainId: string): Promise<any> => {
  const { data } = await axios.get(getProviderURL(chainId, address, PROVIDER.SCANAPI), {
    timeout: DEFAULT_TIMEOUT,
  })
  // We need to check if the abi is present in the response because it's possible
  // That the transaction service just stores the contract and returns 200 without querying for the abi
  // (or querying for the abi failed)
  if (data && data.message === 'OK' && data.result) {
    return JSON.parse(data.result)
  }

  throw new Error('Contract found but ABI is missing when using API service')
}

const getAbi = async (address: string, chainInfo: ChainInfo): Promise<any> => {
  let abi
  try {
    abi = await Promise.any([
      getAbiFromSourcify(address, chainInfo.chainId),
      getAbiFromGateway(address, chainInfo.chainId),
      getAbiFromBlockscout(address, chainInfo.chainId),
      getABIFromScanAPI(address, chainInfo.chainId),
    ])
  } catch {
    abi = null
  }
  return abi
}

export default getAbi
