import { useSafeAppsSDK } from '@gnosis.pm/safe-apps-react-sdk'
import { getSafeApps, SafeAppData, SafeAppsResponse } from '@gnosis.pm/safe-react-gateway-sdk'
import { useCallback, useEffect, useState } from 'react'

// const BASE_URL = 'https://safe-client.gnosis.io'
enum SUPPORTED_CHAINS {
  ACALA = '787',
  KARURA = '686',
  MANDALA = '595',
  ASTAR = '592',
  SHIDEN = '336',
  SHIBUYA = '81',
  BOBABEAM = '1294',
  CRONOS = '25',
  CRONOS_TESTNET = '338',
  EVMOS = '9001',
  EVMOS_TESTNET = '9000',
  HARMONY = '1666600000',
  HARMONY_TESTNET = '1666700000',
  MOONBEAM = '1284',
  MOONRIVER = '1285',
  MOONBASE = '1287',
  TELOS = '40',
  TELOS_TESTNET = '41',
  THUNDER_CORE = '108',
  VELAS = '106',
  VELAS_TESTNET = '111',
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
      return isProdEnv
        ? `https://gateway.safe.astar.network`
        : `https://gateway.staging-safe.astar.network`
    case SUPPORTED_CHAINS.BOBABEAM:
      return isProdEnv
        ? `https://gateway.multisig.bobabeam.boba.network`
        : `https://gateway.staging.multisig.bobabeam.boba.network`
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
    case SUPPORTED_CHAINS.MOONBEAM:
    case SUPPORTED_CHAINS.MOONRIVER:
    case SUPPORTED_CHAINS.MOONBASE:
      return isProdEnv
        ? `https://gateway.multisig.moonbeam.network`
        : `https://gateway.staging.multisig.moonbeam.network`
    case SUPPORTED_CHAINS.TELOS:
    case SUPPORTED_CHAINS.TELOS_TESTNET:
      return `https://gateway.safe.telos.net`
    case SUPPORTED_CHAINS.THUNDER_CORE:
      return isProdEnv ? `` : `https://gateway.staging.safe.thundercore.com`
    case SUPPORTED_CHAINS.VELAS:
    case SUPPORTED_CHAINS.VELAS_TESTNET:
      return isProdEnv ? `https://gateway.velasafe.com` : `https://gateway.staging.velasafe.com`
    default:
      throw new Error('UNSUPPORTED_CHAIN')
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
        const appsList = await getSafeApps(getGatewayBaseUrl(chainInfo.chainId), chainInfo.chainId)

        setOrigin(environmentInfo.origin)
        setSafeAppsList(appsList)
        setNetworkPrefix(chainInfo.shortName)
      } catch (error) {
        console.error('Unable to get chain info:', error)
      }
    })()
  }, [sdk])

  const openSafeApp = useCallback(
    (url: string) => {
      if (origin?.length) {
        window.open(`${origin}/${networkPrefix}:${safe.safeAddress}/apps?appUrl=${url}`, '_blank')
      }
    },
    [networkPrefix, origin, safe],
  )

  const findSafeApp = useCallback(
    (url: string): SafeAppData | undefined => {
      let { hostname } = new URL(url)

      return safeAppsList.find(safeApp => safeApp.url.includes(hostname))
    },
    [safeAppsList],
  )

  return { findSafeApp, openSafeApp }
}
