import { useCallback, useEffect, useState } from 'react'
import {
  getSafeApps,
  SafeAppData,
  SafeAppsResponse,
  setBaseUrl,
} from '@safe-global/safe-gateway-typescript-sdk'
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk'

// const BASE_URL = 'https://safe-client.gnosis.io'
export enum SUPPORTED_CHAINS {
  ACALA = '787',
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
  HOLESKY = '17000',
  IOTEX = '4689',
  IOTEX_TESTNET = '4690',
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
  REYA = '1729',
  RSK = '30',
  RSK_TESTNET = '31',
  SCROLL = '534352',
  SCROLL_ALPHA_TESTNET = '534353',
  SCROLL_SEPOLIA_TESTNET = '534351',
  TELOS = '40',
  TELOS_TESTNET = '41',
  TENET = '155',
  TENET_TESTNET = '1559',
  THUNDER_CORE = '108',
  THUNDER_CORE_TESTNET = '18',
  VELAS = '106',
  VELAS_TESTNET = '111',
  ZETACHAIN_TESTNET = '7001',
  ZKSYNC_ERA = '324',
  ZKSYNC_ERA_TESTNET = '280',
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
    case SUPPORTED_CHAINS.REYA:
      return isProdEnv
        ? `https://gateway.safe.reya.network`
        : `https://gateway.staging.safe.reya.network`
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
    case SUPPORTED_CHAINS.ZETACHAIN_TESTNET:
      return isProdEnv
        ? `https://gateway.safe.zetachain.com`
        : `https://gateway.staging.safe.zetachain.com`
    case SUPPORTED_CHAINS.ZKSYNC_ERA:
    case SUPPORTED_CHAINS.ZKSYNC_ERA_TESTNET:
      return isProdEnv
        ? `https://gateway.zksafe.protofire.io`
        : `https://gateway.staging-zksafe.protofire.io`
    default:
      throw new Error(
        `[getGatewayBaseUrl]: There is no gateway for ${chain}, therefore we cannot get the list of safe apps.`,
      )
  }
}

type UseAppsResponse = {
  findSafeApp: (safeAppUrl: string) => SafeAppData | undefined
  openSafeApp: (safeAppUrl: string) => void
}

export function useApps(): UseAppsResponse {
  const { safe, sdk } = useSafeAppsSDK()
  const [safeAppsList, setSafeAppsList] = useState<SafeAppsResponse>([])
  const [origin, setOrigin] = useState<string>()
  const [networkPrefix, setNetworkPrefix] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      try {
        const chainInfo = await sdk.safe.getChainInfo()
        const environmentInfo = await sdk.safe.getEnvironmentInfo()
        setBaseUrl(getGatewayBaseUrl(chainInfo.chainId))
        const appsList = await getSafeApps(chainInfo.chainId)

        setOrigin(environmentInfo.origin)
        setSafeAppsList(appsList)
        setNetworkPrefix(chainInfo.shortName)
      } catch (error) {
        if (error instanceof Error && error.message.includes('[getGatewayBaseUrl]')) {
          console.warn(error)
        } else {
          console.error('Unable to get chain info:', error)
        }
      }
    })()
  }, [sdk])

  const openSafeApp = useCallback(
    (url: string) => {
      if (origin?.length) {
        window.open(
          `${origin}/apps/open?safe=${networkPrefix}:${safe.safeAddress}&appUrl=${url}`,
          '_blank',
        )
      }
    },
    [networkPrefix, origin, safe],
  )

  const findSafeApp = useCallback(
    (url: string): SafeAppData | undefined => {
      try {
        const { hostname } = new URL(url)

        return safeAppsList.find(safeApp => safeApp.url.includes(hostname))
      } catch (error) {
        console.error('Unable to find Safe App:', error)
      }
    },
    [safeAppsList],
  )

  return { findSafeApp, openSafeApp }
}
