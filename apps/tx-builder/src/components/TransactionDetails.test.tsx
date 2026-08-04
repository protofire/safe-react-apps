import { screen } from '@testing-library/react'

import { render } from '../test-utils'
import TransactionDetails from './TransactionDetails'
import { ProposedTransaction } from '../typings/models'

// Axios is bundled as an ESM module, which Jest cannot load directly.
// https://jestjs.io/docs/ecmascript-modules
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}))

const COUNTER_HEX = '0xB8F88C79d2d655A0acAf5982A13028dDf7628EBe'
const COUNTER_BASE58 = 'TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ'
const OWNER_HEX = '0x61cA933Fd67b9c0eB3A678FB8cda50D4c95bF63d'
const OWNER_BASE58 = 'TJtHDqYHXiM4LPLvsTMFsmmsmXdKFChtxo'

const transaction = (networkPrefix: string): ProposedTransaction => ({
  id: 1,
  contractInterface: null,
  description: {
    to: COUNTER_HEX,
    value: '0',
    networkPrefix,
    nativeCurrencySymbol: 'TRX',
    contractMethod: {
      name: 'withdraw',
      payable: false,
      inputs: [
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
      ],
    },
    contractFieldsValues: { to: OWNER_HEX, amount: '1' },
  },
  raw: { to: COUNTER_HEX, value: '0', data: '0xf3fef3a3' },
})

describe('<TransactionDetails> on a Tron chain', () => {
  it('shows the destination address in base58, without an EIP-3770 prefix', async () => {
    render(<TransactionDetails transaction={transaction('trx-shasta')} />)

    // Full address (the "Interact with:" heading) and the shortened `to` row.
    expect(await screen.findByText(COUNTER_BASE58)).toBeInTheDocument()
    expect(screen.getByText('TSqF5p...YiwZ')).toBeInTheDocument()
    expect(screen.queryByText(COUNTER_HEX)).not.toBeInTheDocument()
    expect(screen.queryByText('trx-shasta:')).not.toBeInTheDocument()
  })

  it('shows address-typed method arguments in base58', async () => {
    render(<TransactionDetails transaction={transaction('trx-shasta')} />)

    expect(await screen.findByText(OWNER_BASE58)).toBeInTheDocument()
    expect(screen.queryByText(OWNER_HEX)).not.toBeInTheDocument()
  })

  it('leaves the encoded calldata as hex', async () => {
    render(<TransactionDetails transaction={transaction('trx-shasta')} />)

    expect(await screen.findByText('0xf3fef3a3')).toBeInTheDocument()
  })
})

describe('<TransactionDetails> on a non-Tron chain', () => {
  it('keeps hex addresses and the network prefix', async () => {
    render(<TransactionDetails transaction={transaction('eth')} />)

    expect(await screen.findByText(COUNTER_HEX)).toBeInTheDocument()
    expect(screen.getByText(OWNER_HEX)).toBeInTheDocument()
    expect(screen.getAllByText('eth:').length).toBeGreaterThan(0)
    expect(screen.queryByText(COUNTER_BASE58)).not.toBeInTheDocument()
  })
})
