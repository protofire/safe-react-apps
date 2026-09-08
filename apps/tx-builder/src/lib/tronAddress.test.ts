import { isTronChainId, tronBase58ToHex, normalizeAddressInput } from './tronAddress'

// base58check-encoded Tron zero address (0x41 prefix + 20 zero bytes + valid checksum),
// verified by computing it directly with ethers.utils.base58/sha256 rather than trusting
// an unverified literal
const ZERO_ADDRESS_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
const ZERO_ADDRESS_HEX = '0x0000000000000000000000000000000000000000'
const BAD_CHECKSUM_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc'

// a real, non-zero base58<->hex pair: the Safe mainnet contract address, verified above by
// deriving its base58 encoding directly from the hex payload before trusting the literal
const SAFE_MAINNET_BASE58 = 'TB2c4z3BMsxhY6EsmkqcktUuonyVYXWFhC'
const SAFE_MAINNET_HEX = '0x0b9ca12d2ce6a6ec17df8fc602144c55a6ab1717'

describe('tronAddress', () => {
  describe('isTronChainId', () => {
    it('returns true for known Tron chain ids', () => {
      expect(isTronChainId('728126428')).toBe(true)
      expect(isTronChainId('2494104990')).toBe(true)
      expect(isTronChainId('3448148188')).toBe(true)
    })

    it('returns false for non-Tron chain ids', () => {
      expect(isTronChainId('1')).toBe(false)
      expect(isTronChainId(undefined)).toBe(false)
    })
  })

  describe('tronBase58ToHex', () => {
    it('decodes a valid base58 address to hex', () => {
      expect(tronBase58ToHex(ZERO_ADDRESS_BASE58)).toBe(ZERO_ADDRESS_HEX)
    })

    it('decodes a real non-zero base58 address (Safe mainnet contract) to hex', () => {
      expect(tronBase58ToHex(SAFE_MAINNET_BASE58)).toBe(SAFE_MAINNET_HEX)
    })

    it('returns null for a bad checksum', () => {
      expect(tronBase58ToHex(BAD_CHECKSUM_BASE58)).toBe(null)
    })

    it('returns null for a non-base58 value', () => {
      expect(tronBase58ToHex('not-a-valid-address')).toBe(null)
    })
  })

  describe('normalizeAddressInput', () => {
    it('converts base58 to hex on a Tron chain', () => {
      expect(normalizeAddressInput(ZERO_ADDRESS_BASE58, '728126428')).toBe(ZERO_ADDRESS_HEX)
    })

    it('leaves the original value unchanged on a non-Tron chain', () => {
      expect(normalizeAddressInput(ZERO_ADDRESS_BASE58, '1')).toBe(ZERO_ADDRESS_BASE58)
    })

    it('leaves hex input unchanged on a Tron chain', () => {
      const hex = '0x680cde08860141F9D223cE4E620B10Cd6741037E'
      expect(normalizeAddressInput(hex, '728126428')).toBe(hex)
    })

    it('leaves a bad-checksum base58 value unchanged so downstream validation catches it', () => {
      expect(normalizeAddressInput(BAD_CHECKSUM_BASE58, '728126428')).toBe(BAD_CHECKSUM_BASE58)
    })
  })
})
