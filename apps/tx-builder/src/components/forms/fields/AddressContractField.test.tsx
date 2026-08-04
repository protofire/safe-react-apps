import { useState } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { render } from '../../../test-utils'
import AddressContractField from './AddressContractField'

// Axios is bundled as an ESM module, which Jest cannot load directly.
// https://jestjs.io/docs/ecmascript-modules
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
}))

const COUNTER_BASE58 = 'TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ'
const COUNTER_HEX = '0xB8F88C79d2d655A0acAf5982A13028dDf7628EBe'

/**
 * This field is *controlled* -- it passes `value` down to the input, unlike the
 * uncontrolled lookup box on the dashboard. Holding the value here reproduces
 * how react-hook-form drives it.
 */
const ControlledHarness = ({
  networkPrefix,
  initialValue,
  onChange,
}: {
  networkPrefix: string
  initialValue: string
  onChange: (value: string) => void
}) => {
  const [value, setValue] = useState(initialValue)

  return (
    <AddressContractField
      id="toAddress"
      name="toAddress"
      label="To Address"
      value={value}
      networkPrefix={networkPrefix}
      onChange={(newValue: string) => {
        onChange(newValue)
        setValue(newValue)
      }}
    />
  )
}

const renderField = (props: { networkPrefix: string; value?: string }) => {
  const onChange = jest.fn()

  render(
    <ControlledHarness
      networkPrefix={props.networkPrefix}
      initialValue={props.value ?? ''}
      onChange={onChange}
    />,
  )

  return { onChange, input: screen.getByRole('textbox') as HTMLInputElement }
}

describe('<AddressContractField> on a Tron chain', () => {
  it('shows base58 for the hex value it is given', () => {
    // Regression: passing `value` down makes the input controlled, which
    // overrides the base58 AddressInput keeps in its ref -- the field showed hex
    // while the dashboard's uncontrolled lookup box showed base58.
    const { input } = renderField({ networkPrefix: 'trx-shasta', value: COUNTER_HEX })

    expect(input.value).toBe(COUNTER_BASE58)
  })

  it('reports hex upwards when base58 is typed, and keeps showing base58', async () => {
    const { input, onChange } = renderField({ networkPrefix: 'trx-shasta' })

    fireEvent.change(input, { target: { value: COUNTER_BASE58 } })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(COUNTER_HEX))
    expect(input.value).toBe(COUNTER_BASE58)
  })

  it('shows base58 for a pasted hex address', async () => {
    const { input, onChange } = renderField({ networkPrefix: 'trx-shasta' })

    fireEvent.change(input, {
      target: { value: '0xb8f88c79d2d655a0acaf5982a13028ddf7628ebe' },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(COUNTER_HEX))
    await waitFor(() => expect(input.value).toBe(COUNTER_BASE58))
  })
})

describe('<AddressContractField> on a non-Tron chain', () => {
  it('shows the hex value unchanged, without a network prefix', () => {
    const { input } = renderField({ networkPrefix: 'eth', value: COUNTER_HEX })

    expect(input.value).toBe(COUNTER_HEX)
  })
})
