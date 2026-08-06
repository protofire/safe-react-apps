import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Title, Text } from '@gnosis.pm/safe-react-components'
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk'
import web3Utils from 'web3-utils'
import { BigNumber } from 'bignumber.js'

import useBalances, { BalancesType } from '../hooks/use-balances'
import { NATIVE_TOKEN, tokenToTx } from '../utils/sdk-helpers'
import FormContainer from './FormContainer'
import Flex from './Flex'
import Logo from './Logo'
import Balances from './Balances'
import SubmitButton from './SubmitButton'
import CancelButton from './CancelButton'
import AddressInput from './AddressInput'
import useWeb3 from '../hooks/useWeb3'
import TimedComponent from './TimedComponent'
import AppLoader from './AppLoader'
import { isTronNetworkPrefix, normalizeTronAddress, toDisplayAddress } from '../utils/tronAddress'

const App = (): React.ReactElement => {
  const { sdk, safe } = useSafeAppsSDK()
  const { web3 } = useWeb3()
  const {
    assets,
    loaded,
    error: balancesError,
    selectedTokens,
    setSelectedTokens,
  }: BalancesType = useBalances(safe.safeAddress, safe.chainId)
  const [submitting, setSubmitting] = useState(false)
  const [toAddress, setToAddress] = useState<string>('')
  const [isFinished, setFinished] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [gasPrice, setGasPrice] = useState<BigNumber>(new BigNumber(0))
  const [networkPrefix, setNetworkPrefix] = useState<string>('')
  const [nativeCurrencyDecimals, setNativeCurrencyDecimals] = useState<number>(18)

  const onError = (userMsg: string, err: Error) => {
    setError(`${userMsg}: ${err.message}`)
    console.error(userMsg, err)
  }

  const isTron = isTronNetworkPrefix(networkPrefix)

  const sendTxs = async (recipient: string): Promise<string> => {
    const txs = assets
      .filter(item => selectedTokens.includes(item.tokenInfo.address))
      .map(item => tokenToTx(recipient, item))
    const data = await sdk.txs.send({ txs })

    return data?.safeTxHash
  }

  const submitTx = async (): Promise<void> => {
    // `toAddress` holds what the user sees, which on Tron is base58. Everything past this
    // point -- the ABI encoder, the bridge, the transaction service -- is hex-only, so this
    // is the one boundary where the conversion happens.
    const recipient = normalizeTronAddress(toAddress)

    if (!web3Utils.isAddress(recipient)) {
      setError('Please enter a valid recipient address')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      await sendTxs(recipient)
    } catch (e) {
      setSubmitting(false)
      onError('Failed sending transactions', e as Error)
      return
    }

    setSubmitting(false)
    setFinished(true)
    setToAddress('')
    setSelectedTokens(assets.map(token => token.tokenInfo.address))
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitTx()
  }

  const onCancel = () => {
    setError('')
    setSubmitting(false)
  }

  const onToAddressChange = useCallback(
    (address: string): void => {
      // Keep the field in the form the user reads: base58 on Tron, unchanged elsewhere.
      // Pasting a 0x… address on Tron therefore flips the field to its T… equivalent.
      setToAddress(toDisplayAddress(address, networkPrefix))
      setError('')
    },
    [networkPrefix],
  )

  const transferStatusText = useMemo(() => {
    if (!selectedTokens.length) {
      return 'No tokens selected'
    }

    if (selectedTokens.length === assets.length) {
      return 'Transfer everything'
    }

    const assetsToTransferCount = selectedTokens.length
    return `Transfer ${assetsToTransferCount} asset${assetsToTransferCount > 1 ? 's' : ''}`
  }, [assets, selectedTokens])

  const getAddressFromDomain = useCallback(
    (address: string) => web3?.eth.ens.getAddress(address) || Promise.resolve(address),
    [web3],
  )

  useEffect(() => {
    if (balancesError) {
      onError('Failed fetching balances', balancesError)
    }
  }, [balancesError])

  useEffect(() => {
    sdk.eth.getGasPrice().then((gasPrice: string) => {
      setGasPrice(new BigNumber(gasPrice))
    })
  }, [sdk.eth])

  // The native token is not necessarily first, and on a chain with no price feed it may be
  // filtered out entirely -- find it rather than assuming its position.
  const ethFiatPrice = Number(
    assets.find(item => item.tokenInfo.type === NATIVE_TOKEN)?.fiatConversion || 0,
  )

  useEffect(() => {
    const getChainInfo = async () => {
      try {
        const { shortName, nativeCurrency } = await sdk.safe.getChainInfo()
        setNetworkPrefix(shortName)
        setNativeCurrencyDecimals(nativeCurrency.decimals)
      } catch (e) {
        console.error('Unable to get chain info:', e)
      }
    }

    getChainInfo()
  }, [sdk])

  if (!loaded) {
    return <AppLoader />
  }

  return (
    <FormContainer onSubmit={onSubmit} onReset={onCancel}>
      <Flex>
        <Logo />
        <Title size="md">Drain Account</Title>
      </Flex>

      {error && (
        <Text size="xl" color="error">
          {error}
        </Text>
      )}

      {assets.length ? (
        <>
          <Balances
            ethFiatPrice={ethFiatPrice}
            nativeCurrencyDecimals={nativeCurrencyDecimals}
            gasPrice={gasPrice}
            assets={assets}
            onSelectionChange={setSelectedTokens}
          />
          {isFinished && (
            <TimedComponent timeout={5000} onTimeout={() => setFinished(false)}>
              <Text size="lg">
                The transaction has been created. ✅<span role="img" aria-label="success"></span>
                <br />
                Refresh the app when it’s executed.
              </Text>
            </TimedComponent>
          )}
          {!submitting && (
            <AddressInput
              id="recipient"
              name="toAddress"
              label="Recipient"
              networkPrefix={networkPrefix}
              address={toAddress}
              hiddenLabel={false}
              onChangeAddress={onToAddressChange}
              // A base58 address is not an EIP-3770 address, so `trx-shasta:T…` would be
              // meaningless. ENS does not exist on Tron either, and resolving there throws
              // on every dotted keystroke.
              showNetworkPrefix={!!networkPrefix && !isTron}
              getAddressFromDomain={isTron ? undefined : getAddressFromDomain}
            />
          )}

          {submitting ? (
            <CancelButton>Cancel</CancelButton>
          ) : (
            <SubmitButton disabled={!selectedTokens.length}>{transferStatusText}</SubmitButton>
          )}
        </>
      ) : (
        <Text size="xl">You don't have any transferable assets</Text>
      )}
    </FormContainer>
  )
}

export default App
