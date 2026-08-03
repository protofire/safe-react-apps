import { Validate, ValidateResult } from 'react-hook-form'
import { toChecksumAddress, toWei } from 'web3-utils'
import {
  NATIVE_AMOUNT_FIELD_TYPE,
  CUSTOM_TRANSACTION_DATA_FIELD_TYPE,
  isAddressFieldType,
  isBooleanFieldType,
  BASIC_UINT_FIELD_TYPE,
} from '../fields/fields'
import { isValidAddress } from '../../../utils'
import basicSolidityValidation from './basicSolidityValidation'
import validateAddressField from './validateAddressField'
import validateAmountField from './validateAmountField'
import validateBooleanField from './validateBooleanField'
import validateHexEncodedDataField from './validateHexEncodedDataField'

export type ValidationFunction = (value: string, fieldType: string) => ValidateResult

// added unit validation to the amount field (amount values are equivalent to uints)
const uintBasicValidation = (value: string): ValidateResult =>
  basicSolidityValidation(toWei(value), BASIC_UINT_FIELD_TYPE)

// Address values are checksum-normalised before validation so that a
// correctly-shaped address passes whatever its casing. `toChecksumAddress`
// throws on anything that is not a 40-hex-char address, though, so guard it:
// otherwise an invalid entry (a Tron base58 `T…` address, a half-typed one, an
// empty field) aborts validation with an uncaught exception instead of
// returning "Invalid address".
const normalizeAddressValue = (value: string): string =>
  isValidAddress(value) ? toChecksumAddress(value) : value

const validateField = (
  fieldType: string,
  extraValidations: ValidationFunction[] = [],
): Validate<string> => {
  return (value: string): ValidateResult =>
    [
      ...getFieldValidations(fieldType), // validations based on the field type
      basicSolidityValidation, // basic solidity field validation
      ...extraValidations, // extra validations
    ].reduce<ValidateResult>(
      (error, validation) => {
        return (
          error ||
          validation(
            isAddressFieldType(fieldType) ? normalizeAddressValue(value) : value,
            fieldType,
          )
        )
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
