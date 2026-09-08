import { ValidateResult } from 'react-hook-form'

import { isInputValueValid, toNativeUnits } from '../../../utils'
import { isTronChainId } from '../../../lib/tronAddress'
import { NATIVE_CURRENCY_DEFAULT_DECIMALS } from './validateField'

const INVALID_AMOUNT_ERROR = 'Invalid amount value'

const validateAmountField = (
  value: string,
  _fieldType?: string,
  chainId?: string,
  nativeCurrencyDecimals: number = NATIVE_CURRENCY_DEFAULT_DECIMALS,
): ValidateResult => {
  if (!value || !value.trim()) {
    return INVALID_AMOUNT_ERROR
  }

  if (!isInputValueValid(value)) {
    return INVALID_AMOUNT_ERROR
  }

  // decided by an explicit check of the raw input's fractional digit count, not by
  // relying on ethers' parseUnits NUMERIC_FAULT detection, which can silently accept
  // trailing zeros (e.g. '1.0000000' has 7 fractional digits but parses fine). Applied on
  // every chain to match base's toWei behavior, which rejected >18 fractional digits
  // unconditionally; only the returned message differs on Tron.
  const fractionalDigits = value.split('.')[1]?.length ?? 0
  if (fractionalDigits > nativeCurrencyDecimals) {
    return isTronChainId(chainId)
      ? `Too many decimal places (max ${nativeCurrencyDecimals})`
      : INVALID_AMOUNT_ERROR
  }

  // should be a valid amount in the native currency's smallest unit
  try {
    toNativeUnits(value, nativeCurrencyDecimals)
  } catch {
    return INVALID_AMOUNT_ERROR
  }
}

export default validateAmountField
