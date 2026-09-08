import { ValidateResult } from 'react-hook-form'

import { isValidAddress } from '../../../utils'
import { normalizeAddressInput } from '../../../lib/tronAddress'

const validateAddressField = (
  value: string,
  _fieldType?: string,
  chainId?: string,
): ValidateResult => {
  if (!isValidAddress(normalizeAddressInput(value, chainId))) {
    return 'Invalid address'
  }
}

export default validateAddressField
