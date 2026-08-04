import InterfaceRepository from './interfaceRepository'
import { tronAbiEntrysToAbi } from './tronAbi'

// Verbatim excerpt of `abi.entrys` returned by
// POST https://api.shasta.trongrid.io/wallet/getcontract for the Shasta testbed
// contract TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ.
const TRON_ENTRYS = [
  { stateMutability: 'Nonpayable', type: 'Constructor' },
  {
    inputs: [
      { indexed: true, name: 'caller', type: 'address' },
      { name: 'newValue', type: 'uint256' },
    ],
    name: 'Incremented',
    type: 'Event',
  },
  { name: 'deposit', stateMutability: 'Payable', type: 'Function' },
  {
    outputs: [{ type: 'uint256' }],
    name: 'getBalance',
    stateMutability: 'View',
    type: 'Function',
  },
  { name: 'increment', stateMutability: 'Nonpayable', type: 'Function' },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'withdraw',
    stateMutability: 'Nonpayable',
    type: 'Function',
  },
]

describe('tronAbiEntrysToAbi', () => {
  const abi = tronAbiEntrysToAbi(TRON_ENTRYS)
  const itemNamed = (name: string) => abi.find(item => item.name === name)

  it('lowercases entry types', () => {
    expect(abi.map(item => item.type)).toEqual([
      'constructor',
      'event',
      'function',
      'function',
      'function',
      'function',
    ])
  })

  it('lowercases state mutability', () => {
    expect(itemNamed('deposit')).toMatchObject({ stateMutability: 'payable', payable: true })
    expect(itemNamed('getBalance')).toMatchObject({ stateMutability: 'view', constant: true })
    expect(itemNamed('increment')).toMatchObject({
      stateMutability: 'nonpayable',
      payable: false,
      constant: false,
    })
  })

  it('fills in the omitted inputs and outputs arrays', () => {
    expect(itemNamed('increment')).toMatchObject({ inputs: [], outputs: [] })
    expect(itemNamed('Incremented')?.inputs).toHaveLength(2)
    expect(itemNamed('Incremented')).not.toHaveProperty('outputs')
  })

  it('preserves parameter names and types', () => {
    expect(itemNamed('withdraw')?.inputs).toEqual([
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ])
  })

  // The point of the conversion: the app's own ABI reader must accept the result.
  it('produces an ABI the interface repository can read methods from', () => {
    const interfaceRepo = new InterfaceRepository({ chainId: '2494104990' } as any)

    const { methods } = interfaceRepo.getMethods(JSON.stringify(tronAbiEntrysToAbi(TRON_ENTRYS)))

    expect(methods).toEqual([
      { name: 'deposit', payable: true, inputs: [] },
      { name: 'increment', payable: false, inputs: [] },
      {
        name: 'withdraw',
        payable: false,
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ])
  })
})
