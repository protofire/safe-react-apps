import { ChainInfo } from '@safe-global/safe-apps-sdk'

import { convertToProposedTransactions } from './transactionLibraryContext'
import { parseFormToProposedTransaction } from '../components/forms/SolidityForm'
import { BatchFile } from '../typings/models'

// A base58 Tron address stored verbatim (unnormalised) in `contractFieldsValues` must still
// produce identical calldata whether the batch is created fresh (SolidityForm path) or
// reloaded/imported (transactionLibraryContext path), because calldata correctness comes from
// `encodeToHexData`'s chainId param at encode time, not from pre-normalised storage.
describe('base58 persisted method params (save/reload regression)', () => {
  const TRON_CHAIN_ID = '728126428'
  const BASE58_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
  // this is the hex address that BASE58_ADDRESS decodes to (see tronAddress.test.ts)
  const HEX_ADDRESS = '0x0000000000000000000000000000000000000000'

  const testMethod = {
    inputs: [{ internalType: 'address', name: 'recipient', type: 'address' }],
    name: 'transfer',
    payable: false,
  }

  const chainInfo = {
    chainId: TRON_CHAIN_ID,
    nativeCurrency: { symbol: 'TRX', decimals: 6 },
    shortName: 'tron',
  } as unknown as ChainInfo

  it('SolidityForm stores contractFieldsValues verbatim (base58 unnormalised), calldata still encodes correctly', () => {
    const proposedTx = parseFormToProposedTransaction(
      {
        toAddress: HEX_ADDRESS,
        nativeAmount: '0',
        contractMethodIndex: '0',
        contractFieldsValues: { 'method-0': { recipient: BASE58_ADDRESS } },
        customTransactionData: '',
      },
      { methods: [testMethod] },
      'TRX',
      'tron',
      TRON_CHAIN_ID,
      6,
    )

    expect(proposedTx.description.contractFieldsValues?.recipient).toBe(BASE58_ADDRESS)
    expect(proposedTx.raw.data).not.toBe('0x')
  })

  it('produces identical calldata on reload whether the stored param was base58 or hex', () => {
    const makeBatchFile = (recipient: string): BatchFile => ({
      version: '1.0',
      chainId: TRON_CHAIN_ID,
      createdAt: Date.now(),
      meta: { name: 'test batch' },
      transactions: [
        {
          to: HEX_ADDRESS,
          value: '0',
          contractMethod: testMethod,
          contractInputsValues: { recipient },
        },
      ],
    })

    const [fromBase58] = convertToProposedTransactions(makeBatchFile(BASE58_ADDRESS), chainInfo)
    const [fromHex] = convertToProposedTransactions(makeBatchFile(HEX_ADDRESS), chainInfo)

    expect(fromBase58.raw.data).not.toBe('0x')
    expect(fromBase58.raw.data).toBe(fromHex.raw.data)
  })

  it('does not throw for a tuple param on a non-Tron chain, and stores values verbatim', () => {
    const tupleMethod = {
      inputs: [
        {
          internalType: 'tuple',
          name: 'data',
          type: 'tuple',
          components: [
            { internalType: 'address', name: 'addr', type: 'address' },
            { internalType: 'uint256', name: 'amount', type: 'uint256' },
          ],
        },
      ],
      name: 'process',
      payable: false,
    }

    const rawTupleValue = '["0x0000000000000000000000000000000000000001","1"]'

    const proposedTx = parseFormToProposedTransaction(
      {
        toAddress: '0x0000000000000000000000000000000000000001',
        nativeAmount: '0',
        contractMethodIndex: '0',
        contractFieldsValues: { 'method-0': { data: rawTupleValue } },
        customTransactionData: '',
      },
      { methods: [tupleMethod] },
      'ETH',
      'eth',
      '1',
      18,
    )

    expect(proposedTx.description.contractFieldsValues?.data).toBe(rawTupleValue)
    expect(proposedTx.raw.data).not.toBe('0x')
  })

  it('normalises a base58 address nested in a tuple(address,uint256) param on Tron, producing calldata identical to the hex-address equivalent, through the reload path', () => {
    const tupleMethod = {
      inputs: [
        {
          internalType: 'tuple',
          name: 'recipient',
          type: 'tuple',
          components: [
            { internalType: 'address', name: 'addr', type: 'address' },
            { internalType: 'uint256', name: 'amount', type: 'uint256' },
          ],
        },
      ],
      name: 'process',
      payable: false,
    }

    const makeBatchFile = (addr: string): BatchFile => ({
      version: '1.0',
      chainId: TRON_CHAIN_ID,
      createdAt: Date.now(),
      meta: { name: 'test batch' },
      transactions: [
        {
          to: HEX_ADDRESS,
          value: '0',
          contractMethod: tupleMethod,
          contractInputsValues: { recipient: JSON.stringify([addr, '1']) },
        },
      ],
    })

    const [fromBase58] = convertToProposedTransactions(makeBatchFile(BASE58_ADDRESS), chainInfo)
    const [fromHex] = convertToProposedTransactions(
      makeBatchFile('0x0000000000000000000000000000000000000000'),
      chainInfo,
    )

    expect(fromBase58.raw.data).not.toBe('0x')
    expect(fromBase58.raw.data).toBe(fromHex.raw.data)
  })

  it('normalises base58 addresses inside a tuple(address[]) param on Tron, producing calldata identical to the hex-address equivalent, through the reload path', () => {
    const tupleArrayMethod = {
      inputs: [
        {
          internalType: 'tuple',
          name: 'data',
          type: 'tuple',
          components: [{ internalType: 'address[]', name: 'recipients', type: 'address[]' }],
        },
      ],
      name: 'process',
      payable: false,
    }

    const makeBatchFile = (addr: string): BatchFile => ({
      version: '1.0',
      chainId: TRON_CHAIN_ID,
      createdAt: Date.now(),
      meta: { name: 'test batch' },
      transactions: [
        {
          to: HEX_ADDRESS,
          value: '0',
          contractMethod: tupleArrayMethod,
          contractInputsValues: { data: JSON.stringify([[addr]]) },
        },
      ],
    })

    const [fromBase58] = convertToProposedTransactions(makeBatchFile(BASE58_ADDRESS), chainInfo)
    const [fromHex] = convertToProposedTransactions(
      makeBatchFile('0x0000000000000000000000000000000000000000'),
      chainInfo,
    )

    expect(fromBase58.raw.data).not.toBe('0x')
    expect(fromBase58.raw.data).toBe(fromHex.raw.data)
  })
})

// Base behavior (toChecksumAddress(rawTo) on a garbage `to`) THROWS on EVM chains. The Tron `to`
// branch must throw the same way instead of silently falling back to the raw garbage value.
describe('convertToProposedTransactions throws on garbage `to` (Tron/EVM symmetry)', () => {
  const testMethod = {
    inputs: [{ internalType: 'address', name: 'recipient', type: 'address' }],
    name: 'transfer',
    payable: false,
  }

  const makeBatchFile = (chainId: string, to: string): BatchFile => ({
    version: '1.0',
    chainId,
    createdAt: Date.now(),
    meta: { name: 'test batch' },
    transactions: [
      {
        to,
        value: '0',
        contractMethod: testMethod,
        contractInputsValues: { recipient: '0x0000000000000000000000000000000000000001' },
      },
    ],
  })

  it.each([['GARBAGE'], ['']])('throws for to: %j on a Tron chain', to => {
    const chainInfo = {
      chainId: '728126428',
      nativeCurrency: { symbol: 'TRX', decimals: 6 },
      shortName: 'tron',
    } as unknown as ChainInfo

    expect(() => convertToProposedTransactions(makeBatchFile('728126428', to), chainInfo)).toThrow()
  })

  it.each([['GARBAGE'], ['']])('throws for to: %j on an EVM chain', to => {
    const chainInfo = {
      chainId: '1',
      nativeCurrency: { symbol: 'ETH', decimals: 18 },
      shortName: 'eth',
    } as unknown as ChainInfo

    expect(() => convertToProposedTransactions(makeBatchFile('1', to), chainInfo)).toThrow()
  })
})
