// Tron ABI -> Solidity ABI JSON.
//
// Tron stores a contract's ABI *on chain*, so the node itself is an ABI source
// and no explorer verification is involved (`wallet/getcontract` returns it for
// any contract deployed with its ABI). The shape differs from standard ABI JSON
// in three ways, all of which the rest of the app cares about:
//
//   - `type` and `stateMutability` are capitalised (`"Function"`, `"Nonpayable"`)
//     -- `interfaceRepository.getMethods` compares them lowercase, so without
//     this conversion `view` methods would be offered as if they were writes.
//   - empty `inputs`/`outputs` are omitted rather than sent as `[]`, which the
//     form code and `web3-eth-abi` expect to be arrays.
//   - the legacy `payable`/`constant` flags are absent.

type TronAbiEntry = {
  type?: string
  name?: string
  stateMutability?: string
  inputs?: unknown[]
  outputs?: unknown[]
  anonymous?: boolean
}

const CALLABLE_TYPES = ['function', 'constructor', 'fallback', 'receive']
const READ_ONLY_MUTABILITIES = ['view', 'pure']

const toStandardAbiItem = (entry: TronAbiEntry): Record<string, unknown> => {
  const type = entry.type?.toLowerCase()
  const stateMutability = entry.stateMutability?.toLowerCase()
  const isCallable = !!type && CALLABLE_TYPES.includes(type)

  return {
    ...entry,
    ...(type ? { type } : {}),
    inputs: entry.inputs ?? [],
    ...(type === 'function' ? { outputs: entry.outputs ?? [] } : {}),
    ...(stateMutability ? { stateMutability } : {}),
    ...(isCallable && stateMutability
      ? {
          payable: stateMutability === 'payable',
          constant: READ_ONLY_MUTABILITIES.includes(stateMutability),
        }
      : {}),
  }
}

export const tronAbiEntrysToAbi = (entrys: TronAbiEntry[]): Record<string, unknown>[] =>
  entrys.map(toStandardAbiItem)
