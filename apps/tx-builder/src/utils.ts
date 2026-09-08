import { AbiItem, toBN, toChecksumAddress } from 'web3-utils'
import { ethers } from 'ethers'
import { ChainInfo } from '@safe-global/safe-gateway-typescript-sdk'
import abiCoder, { AbiCoder } from 'web3-eth-abi'
import { ContractInput, ContractMethod, ProposedTransaction } from './typings/models'
import { isTronChainId, normalizeAddressInput, tronBase58ToHex } from './lib/tronAddress'
import {
  isAddressFieldType,
  isArrayFieldType,
  isArrayOfStringsFieldType,
  isBooleanFieldType,
  isIntFieldType,
  isMatrixFieldType,
  isMatrixOfStringsFieldType,
  isMultiDimensionalArrayFieldType,
  isMultiDimensionalArrayOfStringsFieldType,
  isTupleFieldType,
} from './components/forms/fields/fields'

export enum FEATURES {
  SOCIAL_SCAN = 'SOCIAL_SCAN',
  CRONOS_ZK_EVM = 'CRONOS_ZK_EVM',
  CRONOS = 'CRONOS',
  CRONOS_TESTNET = 'CRONOS_TESTNET',
  SUBSCAN = 'SUBSCAN',
}

export const enum FETCH_STATUS {
  NOT_ASKED = 'NOT_ASKED',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
export class SoliditySyntaxError extends Error {}

export const hasFeature = (chain: Pick<ChainInfo, 'features'>, feature: FEATURES): boolean => {
  return (chain.features as string[]).includes(feature)
}

export const parseBooleanValue = (value: any): boolean => {
  const isStringValue = typeof value === 'string'
  if (isStringValue) {
    const truthyStrings = ['true', 'True', 'TRUE', '1']
    const isTruthyValue = truthyStrings.some(
      truthyString => truthyString === value.trim().toLowerCase(),
    )

    if (isTruthyValue) {
      return true
    }

    const falsyStrings = ['false', 'False', 'FALSE', '0']
    const isFalsyValue = falsyStrings.some(
      falsyString => falsyString === value.trim().toLowerCase(),
    )

    if (isFalsyValue) {
      return false
    }

    throw new SoliditySyntaxError('Invalid Boolean value')
  }

  return !!value
}

const paramTypeNumber = new RegExp(/^(u?int)([0-9]*)(((\[\])|(\[[1-9]+[0-9]*\]))*)?$/)
export const getNumberOfBits = (fieldType: string): number =>
  Number(fieldType.match(paramTypeNumber)?.[2] || '256')

export const parseIntValue = (value: string, fieldType: string) => {
  const trimmedValue = value.replace(/"/g, '').replace(/'/g, '').trim()
  const isEmptyString = trimmedValue === ''

  if (isEmptyString) {
    throw new SoliditySyntaxError('invalid empty strings for integers')
  }

  const bits = getNumberOfBits(fieldType)

  // From web3 1.2.5 negative string numbers aren't correctly padded with leading 0's.
  // To fix that we pad the numeric values here as the encode function is expecting a string
  // more info here https://github.com/ChainSafe/web3.js/issues/3772
  return toBN(trimmedValue).toString(10, bits)
}

// parse a string to an Array. Example: from "[1, 2, [3,4]]" returns [ "1", "2", "[3, 4]" ]
// use this function only for Arrays, Matrix and MultiDimensional Arrays of ints, uints, bytes, addresses and booleans
// do NOT use this function for Arrays, Matrix and MultiDimensional Arrays of strings (for strings use JSON.parse() instead)
export const parseStringToArray = (value: string): string[] => {
  let numberOfItems = 0
  let numberOfOtherArrays = 0
  return value
    .trim()
    .slice(1, -1) // remove the first "[" and the last "]"
    .split('')
    .reduce<string[]>((array, char) => {
      const isCommaChar = char === ','

      if (isCommaChar && numberOfOtherArrays === 0) {
        numberOfItems++
        return array
      }

      const isOpenArrayChar = char === '['

      if (isOpenArrayChar) {
        numberOfOtherArrays++
      }

      const isCloseArrayChar = char === ']'

      if (isCloseArrayChar) {
        numberOfOtherArrays--
      }

      array[numberOfItems] = `${array[numberOfItems] || ''}${char}`.trim()

      return array
    }, [])
}

export const baseFieldtypeRegex = new RegExp(/^([a-zA-Z0-9]*)(((\[\])|(\[[1-9]+[0-9]*\]))*)?$/)

// return the base field type. Example: from "uint128[][2][]" returns "uint128"
export const getBaseFieldType = (fieldType: string): string => {
  const baseFieldType = fieldType.match(baseFieldtypeRegex)?.[1]

  if (!baseFieldType) {
    throw new SoliditySyntaxError(`Unknow base field type ${baseFieldType} from ${fieldType}`)
  }

  return baseFieldType
}

// custom isArray function to return true if a given string is an Array
export const isArray = (values: string): boolean => {
  const trimmedValue = values.trim()
  const isArray = trimmedValue.startsWith('[') && trimmedValue.endsWith(']')

  return isArray
}

const parseArrayOfValues = (
  values: string,
  fieldType: string,
  chainId?: string,
  components?: ContractInput[],
): any => {
  if (!isArray(values)) {
    throw new SoliditySyntaxError('Invalid Array value')
  }

  return parseStringToArray(values).map(itemValue =>
    isArray(itemValue)
      ? parseArrayOfValues(itemValue, fieldType, chainId, components) // recursive call because Matrix and MultiDimensional Arrays field types
      : parseInputValue(
          // recursive call to parseInputValue
          getBaseFieldType(fieldType), // based on the base field type
          itemValue.replace(/"/g, '').replace(/'/g, ''), // removing " and ' chars from the value
          chainId,
          components,
        ),
  )
}

const TRON_BASE58_LEAF_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/

// Single type-directed walker over an already-JSON.parsed tuple/array value, normalising Tron
// base58 addresses at `address` leaves. Never touches non-address leaves (strings, numbers) and
// never throws on shape mismatches — those are left for the encoder to reject exactly as EVM does.
export const normalizeTronAddressLeaves = (
  type: string,
  components: ContractInput[] | undefined,
  value: unknown,
): unknown => {
  const trailingArrayMatch = type.match(/^(.*)(\[[1-9]*[0-9]*\])$/)
  if (trailingArrayMatch) {
    if (!Array.isArray(value)) {
      return value
    }
    const elementType = trailingArrayMatch[1]
    return value.map(item => normalizeTronAddressLeaves(elementType, components, item))
  }

  if (type.startsWith('tuple')) {
    if (!Array.isArray(value) || !components || value.length !== components.length) {
      return value
    }
    return value.map((item, index) =>
      normalizeTronAddressLeaves(components[index].type, components[index].components, item),
    )
  }

  if (type === 'address' && typeof value === 'string' && TRON_BASE58_LEAF_REGEX.test(value)) {
    return tronBase58ToHex(value) ?? value
  }

  return value
}

// This function is used to parse the user input values
export const parseInputValue = (
  fieldType: string,
  value: string,
  chainId?: string,
  components?: ContractInput[],
): any => {
  const trimmedValue = typeof value === 'string' ? value.trim() : value

  if (isAddressFieldType(fieldType)) {
    return toChecksumAddress(normalizeAddressInput(trimmedValue, chainId))
  }

  if (isBooleanFieldType(fieldType)) {
    return parseBooleanValue(trimmedValue)
  }

  if (isIntFieldType(fieldType)) {
    return parseIntValue(trimmedValue, fieldType)
  }

  // FIX: fix the issue with long numbers in the tuples
  if (isTupleFieldType(fieldType)) {
    const parsed = JSON.parse(trimmedValue)

    if (isTronChainId(chainId)) {
      return normalizeTronAddressLeaves(fieldType, components, parsed)
    }

    return parsed
  }

  // for Arrays, Matrix and MultiDimensional Arrays of strings JSON.parse is required
  if (
    isArrayOfStringsFieldType(fieldType) ||
    isMatrixOfStringsFieldType(fieldType) ||
    isMultiDimensionalArrayOfStringsFieldType(fieldType)
  ) {
    return JSON.parse(trimmedValue)
  }

  if (
    isArrayFieldType(fieldType) ||
    isMatrixFieldType(fieldType) ||
    isMultiDimensionalArrayFieldType(fieldType)
  ) {
    return parseArrayOfValues(trimmedValue, fieldType, chainId, components)
  }

  return value
}

export const isInputValueValid = (val: string) => {
  const value = Number(val)
  const isHexValue = val?.startsWith?.('0x')
  const isNegativeValue = value < 0

  if (isNaN(value) || isNegativeValue || isHexValue) {
    return false
  }

  return true
}

export const getCustomDataError = (value: string | undefined) => {
  return `Has to be a valid strict hex data${
    !value?.startsWith('0x') ? ' (it must start with 0x)' : ''
  }`
}

export const isValidAddress = (address: string | null) => {
  if (!address) {
    return false
  }
  // return isAddress(address)
  return /^(0x)?[0-9a-fA-F]{40}$/.test(address)
}

// Unlike isValidAddress (strict lowercase 0x), toChecksumAddress (web3-utils) also accepts an
// uppercase 0X prefix. Use this to gate any new toChecksumAddress call added for Tron support so
// a 0X-prefixed address isn't rejected before it ever reaches toChecksumAddress.
export const isChecksumable = (value: string): boolean => {
  try {
    toChecksumAddress(value)
    return true
  } catch {
    return false
  }
}

const NON_VALID_CONTRACT_METHODS = ['receive', 'fallback']

export const encodeToHexData = (
  contractMethod: ContractMethod | undefined,
  contractFieldsValues: any,
  chainId?: string,
) => {
  const contractMethodName = contractMethod?.name
  const contractFields = contractMethod?.inputs || []

  const isValidContractMethod =
    contractMethodName && !NON_VALID_CONTRACT_METHODS.includes(contractMethodName)

  if (isValidContractMethod) {
    try {
      const parsedValues = contractFields.map((contractField: ContractInput, index) => {
        const contractFieldName = contractField.name || index
        const cleanValue = contractFieldsValues[contractFieldName] || ''

        return parseInputValue(contractField.type, cleanValue, chainId, contractField.components)
      })
      const abi = abiCoder as unknown // a bug in the web3-eth-abi types
      const hexEncondedData = (abi as AbiCoder).encodeFunctionCall(
        contractMethod as AbiItem,
        parsedValues,
      )

      return hexEncondedData
    } catch (error) {
      console.log('Error encoding current form values to hex data: ', error)
    }
  }
}

export const toNativeUnits = (value: string, decimals: number): string => {
  const trimmedValue = value || '0'
  const fractionalDigits = trimmedValue.split('.')[1]?.length || 0

  if (fractionalDigits > decimals) {
    throw new Error('too many decimal places')
  }

  return ethers.utils.parseUnits(trimmedValue, decimals).toString()
}

export const fromNativeUnits = (rawValue: string, decimals: number): string => {
  // base weiToEther('') returned '0' (web3-utils fromWei('') -> '0'); ethers.formatUnits('')
  // throws, so guard empty/whitespace input before it ever reaches ethers
  const trimmedValue = rawValue?.trim()
  if (!trimmedValue) {
    return '0'
  }

  try {
    const formatted = ethers.utils.formatUnits(trimmedValue, decimals)
    // formatUnits always keeps a decimal point (e.g. '1.0'); strip trailing zeros
    // and a trailing bare '.' so display stays byte-identical to the previous fromWei
    return formatted.replace(/0+$/, '').replace(/\.$/, '')
  } catch {
    // base fromWei coerced junk input to some number rather than throwing; '0' is an accepted
    // deviation for genuinely unparseable input (e.g. 'abc', scientific notation '1e18')
    return '0'
  }
}

export const getTransactionText = (description: ProposedTransaction['description']) => {
  const { contractMethod, customTransactionData } = description

  const isCustomHexDataTx = !!customTransactionData
  const isContractInteractionTx = !!contractMethod
  const isTokenTransferTx = !isCustomHexDataTx && !isContractInteractionTx

  if (isTokenTransferTx) {
    return 'Transfer'
  }

  if (isCustomHexDataTx) {
    return 'Custom hex data'
  }

  if (isContractInteractionTx) {
    return contractMethod.name
  }

  // empty tx description as a fallback
  return ''
}

export const getInputTypeHelper = (input: ContractInput): string => {
  // This code renders a helper for the input text.
  if (input.type.startsWith('tuple') && input.components) {
    return `tuple(${input.components
      .map((i: ContractInput) => {
        return getInputTypeHelper(i)
      })
      .toString()})${input.type.endsWith('[]') ? '[]' : ''}`
  } else {
    return input.type
  }
}

// A Template looks like this: "https://rinkeby.etherscan.io/address/{{address}}"
// To replace ``{{address}}`` with the actual address, pass an object with the `address` key
export const evalTemplate = (templateUri: string, data: Record<string, string>): string => {
  const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g
  return templateUri.replace(TEMPLATE_REGEX, (_: string, key: string) => data[key])
}
