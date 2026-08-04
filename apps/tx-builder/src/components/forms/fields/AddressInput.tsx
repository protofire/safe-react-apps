import React, { ReactElement, useState, ChangeEvent, useEffect, useCallback, useRef } from 'react'
import InputAdornment from '@material-ui/core/InputAdornment'
import CircularProgress from '@material-ui/core/CircularProgress'

import {
  addNetworkPrefix,
  checksumAddress,
  getAddressWithoutNetworkPrefix,
  getNetworkPrefix,
  isChecksumAddress,
  isValidAddress,
  isValidEnsName,
} from '../../../utils/address'
import {
  isTronNetworkPrefix,
  normalizeTronAddress,
  toDisplayAddress,
} from '../../../utils/tronAddress'
import TextFieldInput, { TextFieldInputProps } from './TextFieldInput'
import useThrottle from '../../../hooks/useThrottle'

type AddressInputProps = {
  name: string
  address: string
  networkPrefix?: string
  showNetworkPrefix?: boolean
  defaultValue?: string
  disabled?: boolean
  onChangeAddress: (address: string) => void
  getAddressFromDomain?: (name: string) => Promise<string>
  customENSThrottleDelay?: number
  showLoadingSpinner?: boolean
} & TextFieldInputProps

function AddressInput({
  name,
  address,
  networkPrefix,
  showNetworkPrefix = true,
  disabled,
  onChangeAddress,
  getAddressFromDomain,
  customENSThrottleDelay,
  showLoadingSpinner,
  InputProps,
  inputProps,
  hiddenLabel = false,
  ...rest
}: AddressInputProps): ReactElement {
  const [isLoadingENSResolution, setIsLoadingENSResolution] = useState(false)
  const isTron = isTronNetworkPrefix(networkPrefix)
  const defaultInputValue = toInputValue(address, networkPrefix, showNetworkPrefix)
  const inputRef = useRef({ value: defaultInputValue })
  const throttle = useThrottle()

  const updateInputValue = useCallback(
    (value = '') => {
      if (inputRef.current) {
        inputRef.current.value = toInputValue(value, networkPrefix, showNetworkPrefix)
      }
    },
    [networkPrefix, showNetworkPrefix],
  )

  const resolveDomainName = useCallback(async () => {
    const isEnsName = isValidEnsName(address)

    if (isEnsName && getAddressFromDomain) {
      try {
        setIsLoadingENSResolution(true)
        const resolvedAddress = await getAddressFromDomain(address)
        onChangeAddress(checksumValidAddress(resolvedAddress))
        // we update the input value
        updateInputValue(resolvedAddress)
      } catch (e) {
        onChangeAddress(address)
      } finally {
        setIsLoadingENSResolution(false)
      }
    }
  }, [address, getAddressFromDomain, onChangeAddress, updateInputValue])

  // ENS name resolution
  useEffect(() => {
    if (getAddressFromDomain) {
      throttle(resolveDomainName, customENSThrottleDelay)
    }
  }, [getAddressFromDomain, resolveDomainName, customENSThrottleDelay, throttle])

  // if address changes from outside (Like Loaded from a QR code) we update the input value
  useEffect(() => {
    const inputValue = inputRef.current?.value
    const inputWithoutPrefix = getAddressWithoutNetworkPrefix(inputValue)
    const addressWithoutPrefix = getAddressWithoutNetworkPrefix(address)
    const inputPrefix = getNetworkPrefix(inputValue)
    const addressPrefix = getNetworkPrefix(address)

    // On Tron the field shows base58 while the state holds hex, so the two are
    // *expected* to differ. Compare the field against what it should be showing
    // for the current state instead, otherwise every render looks like a new
    // address and rewrites the field mid-typing.
    const isNewAddressLoaded = isTron
      ? inputValue !== toInputValue(address, networkPrefix, showNetworkPrefix)
      : inputWithoutPrefix !== addressWithoutPrefix
    // Base58 addresses carry no EIP-3770 prefix, so there is none to reconcile.
    const isNewPrefixLoaded = !isTron && addressPrefix && inputPrefix !== addressPrefix

    // we check if we load a new address (both prefixed and unprefixed cases)
    if (isNewAddressLoaded || isNewPrefixLoaded) {
      // we update the input value
      updateInputValue(address)
    }
  }, [address, isTron, networkPrefix, showNetworkPrefix, updateInputValue])

  // we trim, checksum & remove valid network prefix when a valid address is typed by the user
  const updateAddressState = useCallback(
    value => {
      const inputValue = value.trim()

      const inputPrefix = getNetworkPrefix(inputValue)
      const inputWithoutPrefix = getAddressWithoutNetworkPrefix(inputValue)

      // if the valid network prefix is present, we remove it from the address state
      const isValidPrefix = networkPrefix === inputPrefix
      const checksumAddress = checksumValidAddress(isValidPrefix ? inputWithoutPrefix : inputValue)

      onChangeAddress(checksumAddress)
    },
    [networkPrefix, onChangeAddress],
  )

  // when user switch the network we update the address state
  useEffect(() => {
    // Because the `address` is going to change after we call `updateAddressState`
    // To avoid calling `updateAddressState` twice, we check the value and the current address
    const inputValue = inputRef.current?.value

    // A Tron field showing base58 for the address already in state is not a
    // change: resolving it would push the same hex back and mark the field dirty.
    const isShowingCurrentAddress =
      isTron &&
      normalizeTronAddress(getAddressWithoutNetworkPrefix(inputValue)).toLowerCase() ===
        getAddressWithoutNetworkPrefix(address).toLowerCase()

    if (inputValue !== address && !isShowingCurrentAddress) {
      updateAddressState(inputRef.current?.value)
    }
  }, [networkPrefix, address, isTron, updateAddressState])

  // when user types we update the address state
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    updateAddressState(e.target.value)
  }

  const isLoading = isLoadingENSResolution || showLoadingSpinner

  const [shrink, setshrink] = useState(!!defaultInputValue)

  useEffect(() => {
    setshrink(!!inputRef.current?.value)
  }, [inputRef.current.value])

  return (
    <TextFieldInput
      name={name}
      hiddenLabel={hiddenLabel && !shrink}
      disabled={disabled || isLoadingENSResolution}
      onChange={onChange}
      InputProps={{
        ...InputProps,
        // if isLoading we show a custom loader adornment
        endAdornment: isLoading ? <LoaderSpinnerAdornment /> : InputProps?.endAdornment,
      }}
      inputProps={{
        ...inputProps,
        ref: inputRef,
      }}
      InputLabelProps={{
        ...rest.InputLabelProps,
        shrink: shrink || hiddenLabel || undefined,
      }}
      spellCheck={false}
      {...rest}
    />
  )
}

export default AddressInput

function LoaderSpinnerAdornment() {
  return (
    <InputAdornment position="end">
      <CircularProgress size="16px" />
    </InputAdornment>
  )
}

// we only checksum valid addresses
function checksumValidAddress(address: string) {
  // A pasted Tron base58 (`T…`) address becomes hex here, at the field boundary:
  // the rest of the app (encoder, transaction service, gateway, bridge) is
  // hex-only, so hex is what the form state and every consumer see.
  const hexAddress = normalizeTronAddress(address)

  if (isValidAddress(hexAddress) && !isChecksumAddress(hexAddress)) {
    return checksumAddress(hexAddress)
  }

  return hexAddress
}

// What the field shows for a given address state. On Tron that is the base58
// form -- the only one Tronscan and TronLink use -- and base58 addresses carry
// no EIP-3770 prefix, so none is added. Every other chain is untouched:
// checksummed hex, optionally prefixed.
function toInputValue(
  address: string,
  networkPrefix: string | undefined,
  showNetworkPrefix: boolean,
): string {
  const normalizedAddress = checksumValidAddress(address)

  return isTronNetworkPrefix(networkPrefix)
    ? toDisplayAddress(normalizedAddress, networkPrefix)
    : addPrefix(normalizedAddress, networkPrefix, showNetworkPrefix)
}

// we try to add the network prefix if its not present
function addPrefix(
  address: string,
  networkPrefix: string | undefined,
  showNetworkPrefix = false,
): string {
  if (!address) {
    return ''
  }

  if (showNetworkPrefix && networkPrefix) {
    const hasPrefix = !!getNetworkPrefix(address)

    // if the address has not prefix we add it by default
    if (!hasPrefix) {
      return addNetworkPrefix(address, networkPrefix)
    }
  }

  return address
}
