import { ReactElement } from 'react'
import AddressInput from './AddressInput'
import { toDisplayAddress } from '../../../utils/tronAddress'

const AddressContractField = ({
  id,
  name,
  value,
  onChange,
  label,
  error,
  getAddressFromDomain,
  networkPrefix,
  onBlur,
}: any): ReactElement => {
  return (
    <AddressInput
      id={id}
      name={name}
      label={label}
      address={value}
      // Passing `value` makes this input *controlled*, which overrides the value
      // `AddressInput` keeps in its ref -- so the Tron base58 rendering has to be
      // applied here too, or the field falls back to showing raw hex state.
      // Unlike the uncontrolled fields, this one never showed a network prefix,
      // and that stays true.
      inputProps={{ value: toDisplayAddress(value, networkPrefix) }}
      onBlur={onBlur}
      showNetworkPrefix={!!networkPrefix}
      networkPrefix={networkPrefix}
      hiddenLabel={false}
      fullWidth
      error={error}
      getAddressFromDomain={getAddressFromDomain}
      onChangeAddress={onChange}
      showErrorsInTheLabel={false}
    />
  )
}

export default AddressContractField
