import { Validate, ValidateResult } from 'react-hook-form'
import { toChecksumAddress } from 'web3-utils'
import {
  NATIVE_AMOUNT_FIELD_TYPE,
  CUSTOM_TRANSACTION_DATA_FIELD_TYPE,
  isAddressFieldType,
  isBooleanFieldType,
  BASIC_UINT_FIELD_TYPE,
} from '../fields/fields'
import { normalizeAddressInput } from '../../../lib/tronAddress'
import { isChecksumable, toNativeUnits } from '../../../utils'
import { ContractInput } from '../../../typings/models'
import basicSolidityValidation from './basicSolidityValidation'
import validateAddressField from './validateAddressField'
import validateAmountField from './validateAmountField'
import validateBooleanField from './validateBooleanField'
import validateHexEncodedDataField from './validateHexEncodedDataField'

export type ValidationFunction = (
  value: string,
  fieldType: string,
  chainId?: string,
  nativeCurrencyDecimals?: number,
  components?: ContractInput[],
) => ValidateResult

export const NATIVE_CURRENCY_DEFAULT_DECIMALS = 18

// added unit validation to the amount field (amount values are equivalent to uints)
const uintBasicValidation = (
  value: string,
  _fieldType: string,
  _chainId?: string,
  nativeCurrencyDecimals: number = NATIVE_CURRENCY_DEFAULT_DECIMALS,
): ValidateResult =>
  basicSolidityValidation(toNativeUnits(value, nativeCurrencyDecimals), BASIC_UINT_FIELD_TYPE)

const validateField = (
  fieldType: string,
  chainId?: string,
  nativeCurrencyDecimals: number = NATIVE_CURRENCY_DEFAULT_DECIMALS,
  extraValidations: ValidationFunction[] = [],
  components?: ContractInput[],
): Validate<string> => {
  return (value: string): ValidateResult =>
    [
      ...getFieldValidations(fieldType), // validations based on the field type
      basicSolidityValidation, // basic solidity field validation
      ...extraValidations, // extra validations
    ].reduce<ValidateResult>(
      (error, validation) => {
        if (error) {
          return error
        }

        if (isAddressFieldType(fieldType)) {
          const normalizedAddress = normalizeAddressInput(value, chainId)
          // a bad-checksum base58 address is returned unchanged by normalizeAddressInput;
          // let the normal 'Invalid address' validator handle it instead of throwing here
          if (!isChecksumable(normalizedAddress)) {
            return validation(normalizedAddress, fieldType, chainId, nativeCurrencyDecimals)
          }

          return validation(
            toChecksumAddress(normalizedAddress),
            fieldType,
            chainId,
            nativeCurrencyDecimals,
          )
        }

        return validation(value, fieldType, chainId, nativeCurrencyDecimals, components)
      },
      undefined, // initially no error is present
    )
}

export default validateField

const getFieldValidations = (fieldType: string): ValidationFunction[] => {
  if (isAddressFieldType(fieldType)) {
    return [validateAddressField]
  }

  if (isBooleanFieldType(fieldType)) {
    return [validateBooleanField]
  }

  if (fieldType === CUSTOM_TRANSACTION_DATA_FIELD_TYPE) {
    return [validateHexEncodedDataField]
  }

  if (fieldType === NATIVE_AMOUNT_FIELD_TYPE) {
    return [validateAmountField, uintBasicValidation]
  }

  // no custom validations as a fallback
  return []
}
