import { screen, waitFor, fireEvent } from '@testing-library/react'
import { within } from '@testing-library/dom'
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk'
import {
  mockTxsRequest,
  mockInitialBalances,
  mockZeroFiatBalances,
  mockZeroFiatTxsRequest,
  renderWithProviders,
} from '../utils/test-helpers'
import App from '../components/App'

jest.mock('@safe-global/safe-apps-react-sdk', () => {
  const originalModule = jest.requireActual('@safe-global/safe-apps-react-sdk')
  const sdk = {
    sdk: {
      txs: { send: jest.fn().mockResolvedValue({ safeTxHash: 'safeTxHash' }) },
      safe: {
        experimental_getBalances: () =>
          Promise.resolve({
            items: mockInitialBalances,
          }),
        getChainInfo: () =>
          Promise.resolve({
            chainId: 4,
            chainName: 'RINKEBY',
            nativeCurrency: {
              address: '0x0000000000000000000000000000000000000000',
              decimals: 18,
              logoUri: '/app/static/media/token_eth.bc98bd46.svg',
              name: 'Ether',
              symbol: 'ETH',
            },
            shortName: 'rin',
          }),
      },
      eth: {
        getGasPrice: () => Promise.resolve(0x3b9aca0b),
        getEstimateGas: () => Promise.resolve(21000),
      },
    },
    safe: {
      safeAddress: '0x57CB13cbef735FbDD65f5f2866638c546464E45F',
      chainId: 'chainId',
    },
  }

  return {
    ...originalModule,
    useSafeAppsSDK: () => sdk,
  }
})

// Hands every test its own deep copy of the fixtures, so a test that tweaks a balance
// cannot leak that tweak into the ones that run after it.
const stubBalances = items => {
  const { sdk } = useSafeAppsSDK()
  sdk.safe.experimental_getBalances = jest
    .fn()
    .mockResolvedValue({ items: JSON.parse(JSON.stringify(items)) })
}

const ETHEREUM_CHAIN_INFO = {
  chainId: 4,
  chainName: 'RINKEBY',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  shortName: 'rin',
}

const TRON_SHASTA_CHAIN_INFO = {
  chainId: 2494104990,
  chainName: 'TRON Shasta',
  nativeCurrency: { decimals: 6, name: 'TRON', symbol: 'TRX' },
  shortName: 'trx-shasta',
}

const stubChainInfo = info => {
  const { sdk } = useSafeAppsSDK()
  sdk.safe.getChainInfo = jest.fn().mockResolvedValue(info)
}

describe('<App />', () => {
  beforeEach(() => {
    const { sdk } = useSafeAppsSDK()
    sdk.txs.send.mockClear()
    stubBalances(mockInitialBalances)
    stubChainInfo(ETHEREUM_CHAIN_INFO)
  })

  it('should render the tokens in the safe balance', async () => {
    renderWithProviders(<App />)

    expect(await screen.findByText(/ether/i)).toBeInTheDocument()
    expect(await screen.findByText(/0.949938510499549077/)).toBeInTheDocument()
  })

  it('should drain the safe when submit button is clicked', async () => {
    renderWithProviders(<App />)
    const { sdk } = useSafeAppsSDK()

    await screen.findByText(/chainlink token/i)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '0x301812eb4c89766875eFe61460f7a8bBC0CadB96' },
    })
    fireEvent.click(screen.getByText(/transfer everything/i))
    await waitFor(() => expect(sdk.txs.send).toHaveBeenCalledWith(mockTxsRequest))
  })

  it('should drain the safe when submit button is clicked removing the tokens excluded by the user', async () => {
    renderWithProviders(<App />)
    const { sdk } = useSafeAppsSDK()

    await screen.findByText(/chainlink token/i)
    const checkboxes = await screen.findAllByRole('checkbox')

    fireEvent.click(checkboxes[2])
    fireEvent.click(checkboxes[4])
    fireEvent.click(checkboxes[5])
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '0x301812eb4c89766875eFe61460f7a8bBC0CadB96' },
    })
    fireEvent.click(screen.getByText(/transfer 2 assets/i))

    await waitFor(() =>
      expect(sdk.txs.send).toHaveBeenCalledWith({
        txs: [mockTxsRequest.txs[0], mockTxsRequest.txs[2]],
      }),
    )
  })

  it('should show an error if no recipient address is entered', async () => {
    renderWithProviders(<App />)

    await screen.findByText(/chainLink token/i)
    fireEvent.click(screen.getByText(/transfer everything/i))

    expect(await screen.findByText(/please enter a valid recipient address/i)).toBeInTheDocument()
  })

  it('should allow to order token by string prop', async () => {
    renderWithProviders(<App />)

    await screen.findByText(/chainlink token/i)
    const assetColumnHeaderElement = screen.getByText(/asset/i)
    fireEvent.click(assetColumnHeaderElement)

    await waitFor(() => {
      const tableRows = document.querySelectorAll('.MuiDataGrid-row')
      expect(within(tableRows[4]).getByText(/chainlink token/i)).toBeDefined()
      expect(within(tableRows[0]).getByText(/uniswap/i)).toBeDefined()
    })

    fireEvent.click(assetColumnHeaderElement)

    await waitFor(() => {
      const tableRows = document.querySelectorAll('.MuiDataGrid-row')
      expect(within(tableRows[0]).getByText(/chainlink token/i)).toBeDefined()
      expect(within(tableRows[4]).getByText(/uniswap/i)).toBeDefined()
    })
  })

  it('should allow to order token by numeric prop', async () => {
    renderWithProviders(<App />)

    await screen.findByText(/chainLink token/i)
    const amountColumnHeaderElement = screen.getByText(/amount/i)
    fireEvent.click(amountColumnHeaderElement)

    await waitFor(() => {
      const tableRows = document.querySelectorAll('.MuiDataGrid-row')
      expect(within(tableRows[0]).getByText(/dai/i)).toBeDefined()
      expect(within(tableRows[4]).getByText(/maker/i)).toBeDefined()
    })

    fireEvent.click(amountColumnHeaderElement)

    await waitFor(() => {
      const tableRows = document.querySelectorAll('.MuiDataGrid-row')
      expect(within(tableRows[4]).getByText(/dai/i)).toBeDefined()
      expect(within(tableRows[0]).getByText(/maker/i)).toBeDefined()
    })
  })

  it('Shows a Warning icon when token transfer cost is higher than its current market value ', async () => {
    renderWithProviders(<App />)

    await screen.findByText(/maker/i)

    const warningTooltip =
      /Beware that the cost of this token transfer could be higher than its current market value \(Estimated transfer cost: /i

    await waitFor(() => {
      const tableRows = document.querySelectorAll('.MuiDataGrid-row')

      // warning only should be present in Maker (MKR) row
      const makerRow = tableRows[3]
      expect(within(makerRow).getByText(/maker/i)).toBeDefined()
      expect(within(makerRow).queryByTitle(warningTooltip)).toBeInTheDocument()

      // warning should NOT be present in other rows
      expect(within(tableRows[0]).queryByTitle(warningTooltip)).not.toBeInTheDocument()
      expect(within(tableRows[1]).queryByTitle(warningTooltip)).not.toBeInTheDocument()
      expect(within(tableRows[2]).queryByTitle(warningTooltip)).not.toBeInTheDocument()
    })
  })

  it('Lists the native token even when it has no fiat value', async () => {
    const balances = JSON.parse(JSON.stringify(mockInitialBalances))
    balances[0].fiatBalance = '0.00000'
    stubBalances(balances)

    renderWithProviders(<App />)

    await screen.findByText(/maker/i)

    expect(document.querySelectorAll('.MuiDataGrid-row').length).toEqual(5)
    expect(screen.getByText(/ether/i)).toBeInTheDocument()
  })

  it('Filters the native token out when its balance is zero', async () => {
    const balances = JSON.parse(JSON.stringify(mockInitialBalances))
    balances[0].balance = '0'
    balances[0].fiatBalance = '0.00000'
    stubBalances(balances)

    renderWithProviders(<App />)

    await screen.findByText(/maker/i)

    expect(document.querySelectorAll('.MuiDataGrid-row').length).toEqual(4)
    expect(screen.queryByText(/ether/i)).not.toBeInTheDocument()
  })

  describe('on a chain with no price feed', () => {
    beforeEach(() => {
      stubBalances(mockZeroFiatBalances)
    })

    it('lists the native token alongside the 6-decimal token, with correct amounts', async () => {
      renderWithProviders(<App />)

      expect(await screen.findByText('TetherToken')).toBeInTheDocument()
      expect(screen.getByText('TRON')).toBeInTheDocument()
      expect(document.querySelectorAll('.MuiDataGrid-row').length).toEqual(2)
      expect(screen.getByText('47')).toBeInTheDocument()
      expect(screen.getByText('85')).toBeInTheDocument()
    })

    it('renders no fiat Value column and no $0.00 beside a real balance', async () => {
      renderWithProviders(<App />)

      await screen.findByText('TetherToken')

      expect(screen.getByRole('columnheader', { name: /asset/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /amount/i })).toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: /value/i })).not.toBeInTheDocument()
      expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    })

    it('sweeps the native balance in full, selected by default', async () => {
      renderWithProviders(<App />)
      const { sdk } = useSafeAppsSDK()

      await screen.findByText('TetherToken')
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: '0x301812eb4c89766875eFe61460f7a8bBC0CadB96' },
      })
      fireEvent.click(screen.getByText(/transfer everything/i))

      await waitFor(() => expect(sdk.txs.send).toHaveBeenCalledWith(mockZeroFiatTxsRequest))
    })
  })

  describe('on Tron', () => {
    // The user reads and writes base58; the bridge, the ABI encoder and the transaction
    // service only ever see hex.
    const RECIPIENT_BASE58 = 'TVawencjV9rskqDTxG4XrKeUQhDV6GNPDU'
    const RECIPIENT_HEX = '0xD72c8d27d0F45173d3178E35B2d496F56a407fF7'

    beforeEach(() => {
      stubChainInfo(TRON_SHASTA_CHAIN_INFO)
      stubBalances(mockZeroFiatBalances)
    })

    const pasteRecipient = async value => {
      renderWithProviders(<App />)
      await screen.findByText('TetherToken')
      const field = screen.getByRole('textbox')
      fireEvent.change(field, { target: { value } })
      return field
    }

    it('submits hex to the SDK when the user pastes a base58 address', async () => {
      const { sdk } = useSafeAppsSDK()
      await pasteRecipient(RECIPIENT_BASE58)

      fireEvent.click(screen.getByText(/transfer everything/i))

      await waitFor(() => expect(sdk.txs.send).toHaveBeenCalled())
      const { txs } = sdk.txs.send.mock.calls[0][0]
      expect(txs[0].to).toEqual(RECIPIENT_HEX)
      expect(JSON.stringify(txs)).not.toContain(RECIPIENT_BASE58)
    })

    it('keeps showing the base58 address, with no EIP-3770 prefix', async () => {
      const field = await pasteRecipient(RECIPIENT_BASE58)

      expect(field.value).toEqual(RECIPIENT_BASE58)
      expect(field.value).not.toContain('trx-shasta:')
    })

    it('shows a pasted hex address in its base58 form', async () => {
      const field = await pasteRecipient(RECIPIENT_HEX)

      await waitFor(() => expect(field.value).toEqual(RECIPIENT_BASE58))
    })

    it('rejects a base58 address with a single-character typo', async () => {
      const { sdk } = useSafeAppsSDK()
      await pasteRecipient(`${RECIPIENT_BASE58.slice(0, -1)}Z`)

      fireEvent.click(screen.getByText(/transfer everything/i))

      expect(await screen.findByText(/please enter a valid recipient address/i)).toBeInTheDocument()
      expect(sdk.txs.send).not.toHaveBeenCalled()
    })
  })
})
