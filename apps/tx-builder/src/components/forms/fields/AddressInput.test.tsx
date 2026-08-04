import { useState } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { render } from '../../../test-utils'
import AddressInput from './AddressInput'

// Axios is bundled as an ESM module, which Jest cannot load directly.
// https://jestjs.io/docs/ecmascript-modules
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}))

const COUNTER_BASE58 = 'TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ'
const COUNTER_HEX = '0xB8F88C79d2d655A0acAf5982A13028dDf7628EBe'
const COUNTER_HEX_LOWERCASE = '0xb8f88c79d2d655a0acaf5982a13028ddf7628ebe'

/**
 * The field is only half of the mechanism: it reports an address upwards and
 * re-reads what it is given back. Holding that state here -- as the form and the
 * dashboard do -- is what exercises the hex-state/base58-display split.
 */
const AddressInputHarness = ({
  networkPrefix,
  initialAddress,
  onChangeAddress,
}: {
  networkPrefix: string
  initialAddress: string
  onChangeAddress: (address: string) => void
}) => {
  const [address, setAddress] = useState(initialAddress)

  return (
    <AddressInput
      name="to"
      label="To Address"
      address={address}
      networkPrefix={networkPrefix}
      showNetworkPrefix
      onChangeAddress={newAddress => {
        onChangeAddress(newAddress)
        setAddress(newAddress)
      }}
    />
  )
}

const renderInput = (props: { networkPrefix: string; address?: string }) => {
  const onChangeAddress = jest.fn()

  render(
    <AddressInputHarness
      networkPrefix={props.networkPrefix}
      initialAddress={props.address ?? ''}
      onChangeAddress={onChangeAddress}
    />,
  )

  return { onChangeAddress, input: screen.getByRole('textbox') as HTMLInputElement }
}

describe('<AddressInput> on a Tron chain', () => {
  it('shows a base58 address for the hex it holds, with no network prefix', () => {
    const { input } = renderInput({ networkPrefix: 'trx-shasta', address: COUNTER_HEX })

    expect(input.value).toBe(COUNTER_BASE58)
  })

  it('stores hex when a base58 address is typed', async () => {
    const { input, onChangeAddress } = renderInput({ networkPrefix: 'trx-shasta' })

    fireEvent.change(input, { target: { value: COUNTER_BASE58 } })

    await waitFor(() => expect(onChangeAddress).toHaveBeenCalledWith(COUNTER_HEX))
  })

  it('leaves a base58 address as typed instead of rewriting it to hex', async () => {
    const { input } = renderInput({ networkPrefix: 'trx-shasta', address: COUNTER_HEX })

    fireEvent.change(input, { target: { value: COUNTER_BASE58 } })

    // The field must not flip to hex behind the user -- that was the bug.
    await waitFor(() => expect(input.value).toBe(COUNTER_BASE58))
  })

  it('accepts a pasted hex address and shows it in base58', async () => {
    const { input, onChangeAddress } = renderInput({ networkPrefix: 'trx-shasta' })

    fireEvent.change(input, { target: { value: COUNTER_HEX_LOWERCASE } })

    await waitFor(() => expect(onChangeAddress).toHaveBeenCalledWith(COUNTER_HEX))
    await waitFor(() => expect(input.value).toBe(COUNTER_BASE58))
  })

  it('leaves a half-typed address as typed', async () => {
    const { input, onChangeAddress } = renderInput({ networkPrefix: 'trx-shasta' })

    fireEvent.change(input, { target: { value: 'TSqF5pn9FxP77jfQ' } })

    await waitFor(() => expect(onChangeAddress).toHaveBeenCalledWith('TSqF5pn9FxP77jfQ'))
    expect(input.value).toBe('TSqF5pn9FxP77jfQ')
  })
})

describe('<AddressInput> on a non-Tron chain', () => {
  it('keeps showing prefixed, checksummed hex', async () => {
    const { input } = renderInput({ networkPrefix: 'eth', address: COUNTER_HEX })

    expect(input.value).toBe(`eth:${COUNTER_HEX}`)
  })

  it('checksums a typed lowercase address', async () => {
    const { input, onChangeAddress } = renderInput({ networkPrefix: 'eth' })

    fireEvent.change(input, { target: { value: COUNTER_HEX_LOWERCASE } })

    await waitFor(() => expect(onChangeAddress).toHaveBeenCalledWith(COUNTER_HEX))
  })

  it('does not convert base58 for display', async () => {
    const { input } = renderInput({ networkPrefix: 'eth', address: COUNTER_HEX })

    expect(input.value).not.toBe(COUNTER_BASE58)
  })
})
