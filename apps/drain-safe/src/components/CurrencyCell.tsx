import { TokenBalance } from '@safe-global/safe-apps-sdk'
import { Icon, Tooltip } from '@gnosis.pm/safe-react-components'
import BigNumber from 'bignumber.js'
import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { formatCurrencyValue, formatTokenValue } from '../utils/formatters'
import { tokenToTx } from '../utils/sdk-helpers'
import Flex from './Flex'
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk'

function CurrencyCell({
  item,
  currency,
  gasPrice,
  ethFiatPrice,
  nativeCurrencyDecimals,
}: {
  item: TokenBalance
  currency: string
  gasPrice: BigNumber
  ethFiatPrice: number
  nativeCurrencyDecimals: number
}) {
  const label = formatCurrencyValue(item.fiatBalance, currency)
  const [transferCostInFiat, setTransferCostInFiat] = useState(new BigNumber(0))

  const { safe, sdk } = useSafeAppsSDK()

  // Transfer cost estimation
  useEffect(() => {
    const estimateTransferCost = async () => {
      try {
        const sendTokenTx = tokenToTx(safe.safeAddress, item)

        const estimatedTransferGas = await sdk.eth.getEstimateGas({
          ...sendTokenTx,
          value:
            item.tokenInfo.type === 'NATIVE_TOKEN'
              ? `0x${Number(sendTokenTx.value).toString(16)}`
              : undefined,
          from: safe.safeAddress,
        })

        const gasCostInSmallestUnit = gasPrice.multipliedBy(estimatedTransferGas)
        // Not every chain's native currency has 18 decimals -- TRX has 6, and dividing by
        // 1e18 there understates the cost by a factor of a trillion.
        const gasCostInNativeCurrency = new BigNumber(
          formatTokenValue(gasCostInSmallestUnit.toString(), nativeCurrencyDecimals),
        )

        const transferCostInFiat = gasCostInNativeCurrency.multipliedBy(ethFiatPrice)

        setTransferCostInFiat(transferCostInFiat)
      } catch (e) {
        console.log('Error: ', e)
      }
    }
    estimateTransferCost()
  }, [gasPrice, ethFiatPrice, item, sdk, safe, nativeCurrencyDecimals])

  // if transfer cost is higher than token market value, we show a warning icon & tooltip in the cell
  const showWarningIcon =
    ethFiatPrice > 0 &&
    gasPrice.toNumber() > 0 &&
    transferCostInFiat.toNumber() >= Number(item.fiatBalance)

  const warningTooltip = `Beware that the cost of this token transfer could be higher than its current market value (Estimated transfer cost: ${formatCurrencyValue(
    transferCostInFiat.toString(),
    currency,
  )})`

  return showWarningIcon ? (
    <Tooltip title={warningTooltip} placement="top">
      <Flex>
        {label}
        <StyledIcon size="md" type="alert" color="warning" />
      </Flex>
    </Tooltip>
  ) : (
    <Flex>{label}</Flex>
  )
}

export default CurrencyCell

const StyledIcon = styled(Icon)`
  margin-left: 4px;
`
