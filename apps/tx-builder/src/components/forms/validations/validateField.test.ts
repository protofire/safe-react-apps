import validateField from './validateField'

/**
 * Address-field validation must never throw.
 *
 * `validateField` checksum-normalises address values before running the
 * validators so that a correctly-shaped address passes regardless of its
 * casing (this fork deliberately relaxed checksum strictness). But
 * `web3-utils`' `toChecksumAddress` *throws* on anything that is not a
 * 40-hex-char address, so normalising unconditionally aborts validation with an
 * uncaught exception instead of returning the "Invalid address" message.
 *
 * On Safe{Wallet} Tron this is the user-visible failure mode behind user story
 * 9: the deployment's bridge is hex-only, so operators will paste Tron base58
 * (`T…`) addresses, and they must get a clear error rather than a crash.
 */
describe('validateField — address fields never throw', () => {
  const NO_ERROR = undefined
  const validateAddress = validateField('address')

  it('rejects a Tron base58 address with a message instead of throwing', () => {
    expect(() => validateAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).not.toThrow()
    expect(validateAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('Invalid address')
  })

  it('rejects arbitrary non-address text with a message instead of throwing', () => {
    expect(() => validateAddress('INVALID ADDRESS VALUE')).not.toThrow()
    expect(validateAddress('INVALID ADDRESS VALUE')).toBe('Invalid address')
  })

  it('rejects an empty value with a message instead of throwing', () => {
    expect(() => validateAddress('')).not.toThrow()
    expect(validateAddress('')).toBe('Invalid address')
  })

  it('rejects a partially typed address with a message instead of throwing', () => {
    // Every intermediate keystroke hits this validator.
    expect(() => validateAddress('0x1f9840a85d5af5bf')).not.toThrow()
    expect(validateAddress('0x1f9840a85d5af5bf')).toBe('Invalid address')
  })

  it('rejects a hex string of the wrong length', () => {
    expect(validateAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f9')).toBe('Invalid address')
    expect(validateAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f98499')).toBe('Invalid address')
  })

  // The checksum normalisation exists for a reason -- these must keep passing.
  it('accepts an all-lowercase address (checksum leniency is the point)', () => {
    expect(validateAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984')).toBe(NO_ERROR)
  })

  it('accepts a correctly checksummed address', () => {
    expect(validateAddress('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984')).toBe(NO_ERROR)
  })

  it('accepts an address whose mixed case is not a valid checksum', () => {
    expect(validateAddress('0x1F9840A85D5AF5BF1D1762F925BDADDC4201F984')).toBe(NO_ERROR)
  })
})

describe('validateField — address array and matrix fields never throw', () => {
  const NO_ERROR = undefined

  it('rejects a base58 address inside an address[] without throwing', () => {
    const validate = validateField('address[]')

    expect(() => validate('[TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t]')).not.toThrow()
    expect(validate('[TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t]')).toEqual(
      expect.stringContaining('error'),
    )
  })

  it('rejects a base58 address inside an address[][] without throwing', () => {
    const validate = validateField('address[][]')

    expect(() => validate('[[TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t]]')).not.toThrow()
  })

  it('accepts an all-lowercase address inside an address[]', () => {
    const validate = validateField('address[]')

    expect(validate('[0x1f9840a85d5af5bf1d1762f925bdaddc4201f984]')).toBe(NO_ERROR)
  })
})
