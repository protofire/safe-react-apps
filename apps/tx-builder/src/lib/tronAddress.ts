import { ethers } from 'ethers'

export const TRON_CHAIN_IDS = ['728126428', '2494104990', '3448148188']

export const isTronChainId = (chainId?: string | number): boolean =>
  chainId !== undefined && TRON_CHAIN_IDS.includes(String(chainId))

const TRON_BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/

// decodes a Tron base58check address (0x41 prefix + 20 address bytes + 4-byte double-sha256 checksum)
export const tronBase58ToHex = (value: string): string | null => {
  let decoded: Uint8Array
  try {
    decoded = ethers.utils.base58.decode(value)
  } catch {
    return null
  }

  if (decoded.length !== 25 || decoded[0] !== 0x41) {
    return null
  }

  const payload = decoded.slice(0, 21)
  const checksum = decoded.slice(21, 25)

  const hash1 = ethers.utils.sha256(payload)
  const hash2 = ethers.utils.sha256(hash1)
  const expectedChecksum = ethers.utils.arrayify(hash2).slice(0, 4)

  const checksumMatches = expectedChecksum.every((byte, index) => byte === checksum[index])
  if (!checksumMatches) {
    return null
  }

  return ethers.utils.hexlify(decoded.slice(1, 21))
}

export const normalizeAddressInput = (value: string, chainId?: string): string => {
  if (isTronChainId(chainId) && TRON_BASE58_REGEX.test(value)) {
    return tronBase58ToHex(value) ?? value
  }

  return value
}
