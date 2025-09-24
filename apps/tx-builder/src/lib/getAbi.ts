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
      return `${scanAPI?.link}/api?module=contract&action=getabi&address=${address}&apikey=${scanAPI?.apiKey}`
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
  ALEPH_ZERO = '41455',
  ALEPH_ZERO_TESTNET = '2039',
  KAVA = '2222',
  KAVA_TESTNET = '2221',
  FLOW_TESTNET = '545',
  HOLESKY = '17000',
  FRAXTAL_TESNET = '2522',
  IMMUTABLE = '13371',
  IMMUTABLE_TESTNET = '13473',
  REYA = '1729',
  IOTEX = '4689',
  IOTEX_TESTNET = '4690',
  KROMA = '255',
  HMNTY = '6985385',
  HMNTYTEST = '7080969',
  KROMA_SEPOLIA = '2358',
  LINEA = '59144',
  ABSTRACT = '2741',
  ABSTRACT_TESTNET = '11124',
  AUTONOMYS_TAURUS_NETWORK = '490000',
  BERACHAIN = '80094',
  BERACHAIN_CARTIO = '80000',
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
  SEI_TESTNET = '1328',
  SEI_DEVNET = '713715',
  STORY = '1514',
  STORY_AENEID = '1315',
  TANGIBLE_REAL = '111188',
  TANGIBLE_UNREAL = '18233',
  TAIKO = '167000',
  KAKAROT = '920637907288165',
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
  CROSSFI = '4158',
  CROSS_FI_TESTNET = '4157',
  WEMIX = '1111',
  WEMIX_TESTNET = '1112',
  XAI = '660279',
  XAI_TESTNET = '37714555429',
  MORPH_HOLESKY = '2810',
  MINT = '185',
  SHAPE = '11011',
  SHAPE_TESTNET = '360',
  VANA = '1480',
  VANA_MOKSHA_TESTNET = '14800',
  SOPHON = '50104',
  SOPHON_TESTNET = '531050104',
  NIBIRU = '6900',
  NIBIRU_TESTNET = '6911',
  HOODIE_TESTNET = '560048',
  EXPCHAIN_TESTNET = '18880',
  ZIRCUIT = '48900',
  ZIRCUIT_TESTNET = '48899',
  GAME7 = '2187',
  GAME7_TESTNET = '13746',
  PHAROS_TESTNET = '688688',
  ETHEREAL_TESTNET_0 = '13374202',
  STABLE_TESTNET = '2201'
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
    case SUPPORTED_CHAINS.FRAXTAL_TESNET:
      return isProdEnv
        ? `https://gateway.safe.optimism.io`
        : `https://gateway.staging.safe.optimism.io`
    case SUPPORTED_CHAINS.BLAST:
    case SUPPORTED_CHAINS.BLAST_TESTNET:
      return isProdEnv ? `https://gateway.blast-safe.io` : `https://gateway.blast-safe.io`
    case SUPPORTED_CHAINS.BOB:
    case SUPPORTED_CHAINS.BOB_TESTNET:
      return isProdEnv ? `https://gateway.safe.gobob.xyz` : `https://gateway.staging.safe.gobob.xyz`
    case SUPPORTED_CHAINS.BERACHAIN:
      return isProdEnv
        ? `https://gateway.safe.berachain.com`
        : `https://gateway.staging.safe.berachain.com`

    case SUPPORTED_CHAINS.BOBABEAM:
      return isProdEnv
        ? `https://gateway.multisig.bobabeam.boba.network`
        : `https://gateway.staging.multisig.bobabeam.boba.network`
    case SUPPORTED_CHAINS.CASCADIA_TESTNET:
      return `https://gateway.safe.cascadia.foundation`
    case SUPPORTED_CHAINS.STORY:
    case SUPPORTED_CHAINS.STORY_AENEID:
      return isProdEnv
        ? `https://gateway.safe.story.foundation`
        : `https://gateway.staging.safe.story.foundation`
    case SUPPORTED_CHAINS.KAKAROT:
      return `https://gateway.staging.safe.kakarot.org`
    case SUPPORTED_CHAINS.CRONOS:
    case SUPPORTED_CHAINS.CRONOS_TESTNET:
      return isProdEnv
        ? `https://gateway.cronos-safe.org`
        : `https://gateway-cronos-safe.crolabs-int.co`
    case SUPPORTED_CHAINS.VANA:
    case SUPPORTED_CHAINS.VANA_MOKSHA_TESTNET:
      return isProdEnv ? `https://gateway.safe.vana.org` : `https://gateway.staging.safe.vana.org`
    case SUPPORTED_CHAINS.AUTONOMYS_TAURUS_NETWORK:
      return isProdEnv
        ? `https://gateway.safe.autonomys.xyz`
        : `https://gateway.staging.safe.autonomys.xyz`
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
    case SUPPORTED_CHAINS.HMNTY:
    case SUPPORTED_CHAINS.HMNTYTEST:
        return isProdEnv
        ? `https://gateway.safe.humanity.org`
        : `https://gateway.staging.safe.humanity.org`
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
    case SUPPORTED_CHAINS.ABSTRACT:
      return isProdEnv
        ? `https://gateway.safe.abs.xyz`
        : `https://gateway.staging.safe.abs.xyz`
    case SUPPORTED_CHAINS.ABSTRACT_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.abs.xyz`
        : `https://gateway.staging.safe.abs.xyz`
    case SUPPORTED_CHAINS.REYA:
      return isProdEnv
        ? `https://gateway.safe.reya.network`
        : `https://gateway.staging.safe.reya.network`

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
    case SUPPORTED_CHAINS.SEI_TESTNET:
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
    case SUPPORTED_CHAINS.CROSSFI:
      return isProdEnv
        ? 'https://gateway.staging.safe.crossfi.org'
        : 'https://gateway.safe.crossfi.org'
    case SUPPORTED_CHAINS.WEMIX:
    case SUPPORTED_CHAINS.WEMIX_TESTNET:
      return isProdEnv ? 'https://gateway.safe.wemix.com' : 'https://gateway.staging.safe.wemix.com'
    case SUPPORTED_CHAINS.XAI:
    case SUPPORTED_CHAINS.XAI_TESTNET:
      return isProdEnv
        ? `https://gateway.safe-xai.protofire.io`
        : `https://gateway.staging-safe-xai.protofire.io`
    case SUPPORTED_CHAINS.MORPH_HOLESKY:
      return isProdEnv ? `https://gateway.safe.morphl2.io` : `https://gateway.stg.safe.morphl2.io`
    case SUPPORTED_CHAINS.TAIKO:
    case SUPPORTED_CHAINS.TAIKO_HEKLA:
      return isProdEnv ? 'https://gateway.safe.taiko.xyz' : 'https://gateway.staging.safe.taiko.xyz'
    case SUPPORTED_CHAINS.SOPHON:
    case SUPPORTED_CHAINS.SOPHON_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.sophon.xyz`
        : `https://gateway.staging.safe.sophon.xyz`
    case SUPPORTED_CHAINS.ALEPH_ZERO:
    case SUPPORTED_CHAINS.ALEPH_ZERO_TESTNET:
      return isProdEnv
        ? `https://gateway.alephzero-safe.protofire.io`
        : `https://gateway.staging.alephzero-safe.protofire.io`
    case SUPPORTED_CHAINS.EXPCHAIN_TESTNET:
      return isProdEnv
        ? `https://gateway.polyhedra-safe.protofire.io`
        : `https://gateway.staging.polyhedra-safe.protofire.io`
    case SUPPORTED_CHAINS.ZIRCUIT:
    case SUPPORTED_CHAINS.ZIRCUIT_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.zircuit.com`
        : `https://gateway.staging.safe.zircuit.com`
    case SUPPORTED_CHAINS.KAVA:
    case SUPPORTED_CHAINS.KAVA_TESTNET:
      return isProdEnv ? `https://gateway.safe.kava.io` : `https://gateway.staging.safe.kava.io`
    case SUPPORTED_CHAINS.SHAPE:
    case SUPPORTED_CHAINS.SHAPE_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.shape.network`
        : `https://gateway.staging.safe.shape.network`
    case SUPPORTED_CHAINS.GAME7:
    case SUPPORTED_CHAINS.GAME7_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.game7.io`
        : `https://gateway.staging.safe.game7.io/api`
    case SUPPORTED_CHAINS.PHAROS_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.pharosnetwork.xyz`
        : 'https://gateway.staging.safe.pharosnetwork.xyz'
    case SUPPORTED_CHAINS.ETHEREAL_TESTNET_0:
      return isProdEnv
        ? 'https://gateway.safe.etherealtest.net'
        : 'https://gateway.safe.etherealtest.net'
    case SUPPORTED_CHAINS.STABLE_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.stable.xyz`
        : `https://gateway.staging.safe.stable.xyz`
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
    case SUPPORTED_CHAINS.KAKAROT:
      return { link: 'https://api.sepolia.kakarotscan.org' }
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
    case SUPPORTED_CHAINS.FRAXTAL_TESNET:
      return {
        link: 'https://holesky.fraxscan.com/',
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
    case SUPPORTED_CHAINS.SOPHON:
      return {
        link: 'https://api.sophscan.xyz',
        apiKey: process.env.REACT_APP_SOPHONSCAN_KEY,
      }
    case SUPPORTED_CHAINS.SOPHON_TESTNET:
      return {
        link: 'https://api-sepolia.sophscan.xyz',
        apiKey: process.env.REACT_APP_SOPHONSCAN_KEY,
      }
    case SUPPORTED_CHAINS.BERACHAIN_CARTIO:
      return {
        link: 'https://berachain.cartio.io',
      }
    case SUPPORTED_CHAINS.BERACHAIN:
      return {
        link: 'https://api.berascan.com',
        apiKey: process.env.REACT_APP_BERASCAN_KEY,
      }
    case SUPPORTED_CHAINS.ABSTRACT:
      return {
        link: 'https://api.abscan.org',
        apiKey: process.env.REACT_APP_ABSTRACT_KEY,
      }
    case SUPPORTED_CHAINS.ABSTRACT_TESTNET:
      return {
        link: 'https://api-testnet.abscan.org',
        apiKey: process.env.REACT_APP_ABSTRACT_KEY,
      }
    case SUPPORTED_CHAINS.NIBIRU:
      return {
        link: 'https://api.routescan.io/v2/network/mainnet/evm/6900/etherscan',
      }
    case SUPPORTED_CHAINS.NIBIRU_TESTNET:
      return {
        link: 'https://api.routescan.io/v2/network/testnet/evm/6911/etherscan',
      }
    case SUPPORTED_CHAINS.HOODIE_TESTNET:
      return {
        link: 'https://api-hoodi.etherscan.io',
        apiKey: process.env.REACT_APP_ETHERSCAN_KEY,
      }
    case SUPPORTED_CHAINS.SEI:
      return {
        link: 'https://seitrace.com/arctic-1/api',
      }
    case SUPPORTED_CHAINS.SEI_TESTNET:
      return {
        link: 'https://seitrace.com/atlantic-2/api',
      }
    case SUPPORTED_CHAINS.SEI_DEVNET:
      return {
        link: 'https://seitrace.com/pacific-1/api',
      }
    case SUPPORTED_CHAINS.OASIS_SAPPHIRE:
        return {
        link: 'https://nexus.oasis.io/v1',
      }
    case SUPPORTED_CHAINS.OASIS_SAPPHIRE_TESTNET:
      return {
        link: 'https://testnet.nexus.oasis.io/v1',
      }
    case SUPPORTED_CHAINS.BOBA:
      return {
        link: 'https://api.routescan.io/v2/network/mainnet/evm/288/etherscan/api',
      }
    case SUPPORTED_CHAINS.BOBA_BNB:
      return {
        link: 'https://api.routescan.io/v2/network/mainnet/evm/56288/etherscan/api',
      }
    case SUPPORTED_CHAINS.BOBA_BNB_TESTNET:
      return {
        link: 'https://api.routescan.io/v2/network/testnet/evm/56288/etherscan/api',
      }
    case SUPPORTED_CHAINS.BOBA_TESTNET:
      return {
        link: 'https://api.routescan.io/v2/network/testnet/evm/9728/etherscan/api',
      }
    case SUPPORTED_CHAINS.PHAROS_TESTNET:
      return {
        link: 'https://api.socialscan.io/pharos-testnet/v1/developer',
        apiKey: process.env.REACT_APP_PHAROS_KEY
      }
    case SUPPORTED_CHAINS.ETHEREAL_TESTNET_0:
      return {
        link: 'https://explorer-ethereal-testnet-0.t.conduit.xyz/api',
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
    case SUPPORTED_CHAINS.FLOW_TESTNET:
      return 'https://evm-testnet.flowscan.io'
    case SUPPORTED_CHAINS.REYA:
      return 'https://explorer.reya.network'
    case SUPPORTED_CHAINS.STORY:
      return 'https://storyscan.io/'
    case SUPPORTED_CHAINS.STORY_AENEID:
      return 'https://aeneid.storyscan.io'
    case SUPPORTED_CHAINS.HOODIE_TESTNET:
      return 'https://hoodi.cloud.blockscout.com'
    case SUPPORTED_CHAINS.EXPCHAIN_TESTNET:
      return 'https://blockscout-testnet.expchain.ai'
    case SUPPORTED_CHAINS.ALEPH_ZERO:
      return 'https://evm-explorer.alephzero.org'
    case SUPPORTED_CHAINS.ALEPH_ZERO_TESTNET:
      return 'https://aleph-zero.blockscout.com'
    case SUPPORTED_CHAINS.HMNTY:
      return 'https://humanity-mainnet.explorer.alchemy.com'
    case SUPPORTED_CHAINS.HMNTYTEST:
      return 'https://humanity-testnet.explorer.alchemy.com'
    case SUPPORTED_CHAINS.SHAPE:
      return 'https://shapescan.xyz'
    case SUPPORTED_CHAINS.SHAPE_TESTNET:
      return 'https://sepolia.shapescan.xyz'
    case SUPPORTED_CHAINS.VANA:
      return 'https://vanascan.io'
    case SUPPORTED_CHAINS.VANA_MOKSHA_TESTNET:
      return 'https://moksha.vanascan.io'
    case SUPPORTED_CHAINS.ASTAR:
      return 'https://astar.blockscout.com'
    case SUPPORTED_CHAINS.SHIDEN:
      return 'https://shiden.blockscout.com'
    case SUPPORTED_CHAINS.SHIBUYA:
      return 'https://shibuya.blockscout.com'
    case SUPPORTED_CHAINS.GAME7:
      return 'https://mainnet.game7.io'
    case SUPPORTED_CHAINS.GAME7_TESTNET:
      return 'https://testnet.game7.io'
    case SUPPORTED_CHAINS.ETHEREAL_TESTNET_0:
      return 'https://explorer.etherealtest.net'
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
