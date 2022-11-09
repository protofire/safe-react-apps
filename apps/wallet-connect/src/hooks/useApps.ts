import { useCallback, useEffect, useState } from 'react'
import {
  getSafeApps,
  SafeAppData,
  SafeAppsResponse,
  setBaseUrl,
} from '@safe-global/safe-gateway-typescript-sdk'
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk'

type UseAppsResponse = {
  findSafeApp: (safeAppUrl: string) => SafeAppData | undefined
  openSafeApp: (safeAppUrl: string) => void
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

const getGatewayBaseUrl = (chain: string): string => {
  let url: string
  switch (chain) {
    case SUPPORTED_CHAINS.ACALA:
      url = `https://gateway.safe.acala.network/`
      break
    case SUPPORTED_CHAINS.KARURA:
      url = `https://gateway.safe.acala.network/`
      break
    case SUPPORTED_CHAINS.MANDALA:
      url = `https://gateway.safe.acala.network/`
      break
    case SUPPORTED_CHAINS.ASTAR:
      url = `https://gateway.safe.astar.network/`
      break
    case SUPPORTED_CHAINS.BOBABEAM:
      url = `https://gateway.multisig.bobabeam.boba.network/`
      break
    case SUPPORTED_CHAINS.CRONOS:
      url = `https://gateway.cronos-safe.org/`
      break
    case SUPPORTED_CHAINS.CRONOS_TESTNET:
      url = `https://gateway.cronos-safe.org/`
      break
    case SUPPORTED_CHAINS.EVMOS:
      url = `https://gateway.safe.evmos.org/`
      break
    case SUPPORTED_CHAINS.EVMOS_TESTNET:
      url = `https://gateway.safe.evmos.org/`
      break
    case SUPPORTED_CHAINS.HARMONY:
      url = `https://gateway.staging-safe.harmony.one/`
      break
    case SUPPORTED_CHAINS.MOONBEAM:
      url = `https://gateway.multisig.moonbeam.network/`
      break
    case SUPPORTED_CHAINS.MOONRIVER:
      url = `https://gateway.multisig.moonbeam.network/`
      break
    case SUPPORTED_CHAINS.MOONBASE:
      url = `https://gateway.multisig.moonbeam.network/`
      break
    case SUPPORTED_CHAINS.TELOS:
      url = `https://gateway.safe.telos.net/`
      break
    case SUPPORTED_CHAINS.TELOS_TESTNET:
      url = `https://gateway.safe.telos.net/`
      break
    case SUPPORTED_CHAINS.VELAS:
      url = `https://gateway.velasafe.com/`
      break
    case SUPPORTED_CHAINS.VELAS_TESTNET:
      url = `https://gateway.velasafe.com/`
      break
    default:
      throw new Error('unsupported chain')
  }
  return url
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
        console.error('Unable to get chain info:', error)
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
