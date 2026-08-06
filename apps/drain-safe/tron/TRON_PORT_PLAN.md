All four gaps verified against the repo. Here is the full revised report.

---

All load-bearing claims verified against the repo and against the live gateway. Corrections applied where the reports disagreed (Report B's drain-safe line numbers were consistently off by 1–8; Report A's `safe-react-components` version claim needed splitting into root-hoist 0.9.8 vs drain-safe-nested 1.2.0). Four critic gaps re-verified and folded in: the vendored field's theme shape (§4.2, now a decision rather than a verbatim copy), the existing `App.test.js` case that G1 breaks (§4.3/§4.8/commit 1), the `submitTx` normalize/submit mismatch (§4.4), and the verifier's `--expect-gateway` check (§4.7). Here is the merged plan.

---

# Making `apps/drain-safe` work on Tron (Shasta + Mainnet)

**Branch:** `protofire-tron-stg` · **Verified:** 2026-08-05 (repo reads + live probes of `https://gateway-tron.stage.safe.protofire.io`)
All paths relative to `/home/den/protofire/safe/safe-react-apps`.

---

## 1. TL;DR

Two things break, and only one of them is about address formats. First, **the app is a no-op on the Tron deployment as it stands**: `use-balances.ts:14-16` drops the native token whenever `fiatBalance` is `0`, and the Tron gateway has `balancesProvider.enabled: false`, so *every* asset reports `fiatBalance: "0"` — a Safe holding only TRX renders "You don't have any transferable assets" (`App.tsx:189`). I confirmed this live: `GET /v1/chains/2494104990/safes/0xD72c…/balances/USD` returns `balance: "1000000"`, `fiatBalance: "0"` for TRX. Second, **the recipient field rejects the only address form a Tron user has**: `web3Utils.isAddress('T…')` is `false` (probed), so `App.tsx:52` fires "Please enter a valid recipient address", and even if that guard were loosened, `web3Utils.toChecksumAddress` throws `Given address "TR7NHqje…" is not a valid Ethereum address.` at `sdk-helpers.ts:11`, `:20`, `:26` (probed). The fix shape follows tx-builder's established policy exactly — **hex is canonical in state, calldata and every SDK call; base58 is accepted on paste and rendered on display, and nothing between the field and the wire ever sees a `T…` string** — implemented by copying `tronAddress.ts` + `sha256.ts` into drain-safe and vendoring tx-builder's already-Tron-aware `AddressInput` fork, because drain-safe's `components/AddressInput.tsx` is a 17-line `styled()` wrapper around a prebuilt `node_modules` bundle that cannot be patched.

The vendoring is **not** a clean verbatim copy, and this is the plan's sharpest edge: tx-builder's `fields/styles.ts` reads an **MUI v5 theme** (`theme.palette.*`, `theme.typography.fontFamily`) off styled-components' context, which tx-builder supplies via `index.tsx:16-18` → `SafeThemeProvider` → `createSafeTheme`. drain-safe's styled-components theme is the **`@gnosis.pm/safe-react-components` theme** (`index.tsx:3-4,13`) — `{buttons, colors, fonts, margin, …}`, **no `palette`, no `typography`**. A verbatim copy therefore evaluates `theme.palette.error.main` on an object with no `palette` and throws a `TypeError` on the field's first render, and TypeScript cannot catch it: with no `DefaultTheme` declaration merge anywhere in this repo, styled-components' `AnyIfEmpty<DefaultTheme>` resolves `theme` to `any` (confirmed: `tsc --noEmit` on `styles.ts` passes clean). §4.2 resolves this by **rewriting `styles.ts` against the components theme** rather than copying it.

Tron is detected by `shortName` (`isTronNetworkPrefix`), never by chainId — drain-safe already fetches `shortName` at `App.tsx:124`, so no plumbing is needed and mainnet (`trx`) is covered by construction. The calldata layer needs **no change at all**: TRC-20 is ABI-identical to ERC-20, selector `a9059cbb`, address left-padded to 32 bytes with the `0x41` prefix dropped — so the golden vectors in `__tests__/sdk-helpers.test.js:14-24` must stay byte-identical. Beyond that, two unit bugs surface on Tron (`fromWei(…, 'ether')` on a 6-decimal chain, `ethFiatPrice = assets[0]?.fiatConversion`) and one genuinely unverified item remains: `contractAddresses.multiSendAddress` and `multiSendCallOnlyAddress` are both `null` in the live chain config, and drain-safe is *inherently* a multi-tx batch, so a real 2-asset drain must be executed before anything is called done. drain-safe's display surface is far smaller than tx-builder's — **exactly one human-visible address, the recipient field** — so this is roughly a third of the tx-builder work.

---

## 2. How drain-safe works today

The app makes **zero HTTP calls of its own** — no `process.env`, no `REACT_APP_*`, no URLs in `src` (verified). Everything crosses the `postMessage` bridge to the host Safe{Wallet}: `SafeProvider` mounts at `index.tsx:15`, `App.tsx:21` takes `{sdk, safe}`, `useBalances` fetches `sdk.safe.experimental_getBalances({currency:'USD'})` (`use-balances.ts:31-33` → Client Gateway `/balances/{currency}`), the user types a recipient into a `styled()` wrapper around `@gnosis.pm/safe-react-components`' `AddressInput`, and `sendTxs` (`App.tsx:42-49`) maps each selected asset through `tokenToTx` into one `BaseTransaction` and hands the array to `sdk.txs.send`. `sdk.txs.send` performs **no validation whatsoever** (`safe-apps-sdk/dist/src/txs/index.js:31-41` — only `if (!txs || !txs.length) throw`), so every format guarantee is enforced inside this app by `web3-utils`, then again downstream by the host and Transaction Service. Chain-dependent behaviour is essentially nil: `shortName` for the field prefix, and `chainId` used only as a `useCallback` guard.

**Theming.** `index.tsx:3-4,13` wraps the whole app in `<ThemeProvider theme={theme}>` with `theme` imported from `@gnosis.pm/safe-react-components`. That object's shape (`apps/drain-safe/node_modules/@gnosis.pm/safe-react-components/dist/theme.d.ts`) is `{buttons, colors, statusDot, fonts, margin, icons, iconText, identicon, loader, text, title, tooltip}`. `colors` carries `text`, `error`, `placeHolder`, `icon`, `inputField`, `inputFilled`, `inputDefault`, `inputDisabled`, `separator`, `background`, `white`, `warning`, … `fonts` carries `fontFamily` and `fontFamilyCode`. There is **no `palette` and no `typography` key**. In tests, `utils/test-helpers.tsx:4-46 mockTheme` is a further-reduced subset of that same shape (`buttons.size.lg`, `colors.disabled`, `fonts.fontFamily`, `text.size.*`, `title.size.md` — and nothing else), fed through `renderWithProviders` (`:150-154`). Consumers of this shape: `Title`/`Text` (`App.tsx:2`), `Icon`/`Tooltip` (`CurrencyCell.tsx:2`), `DataTable` (`Balances.tsx:2`) — **the theme cannot be swapped wholesale.**

### Address / encoding touchpoints

| file:line | Operation | Format | Tron status |
|---|---|---|---|
`App.tsx:31` | `toAddress` state | whatever the field yields | must become **hex** |
`App.tsx:42-49` | `sendTxs()` — closes over `toAddress`, takes no argument | — | see §4.4: must take the validated recipient as a parameter |
`App.tsx:44` | `selectedTokens.includes(item.tokenInfo.address)` | hex both sides (CGW) | identity key — **stays hex** |
`App.tsx:45` | `tokenToTx(toAddress, item)` | must be hex | **must receive the normalized value**, see §4.4 |
`App.tsx:52` | `web3Utils.isAddress(toAddress)` — the only validation | hex-only | **primary blocker**; probed `isAddress('T…') === false` |
`App.tsx:71`, `use-balances.ts:37`, `Balances.tsx:36,98` | selection model / DataGrid row `id` | hex (`''`/`0x000…0` for native) | identity keys — **stay hex** |
`App.tsx:84-87` | `onToAddressChange` — the field's sink | — | the one-line ingress hook |
`App.tsx:102-105` | `getAddressFromDomain` → `web3.eth.ens.getAddress` | Ethereum-only | dead on Tron; **throws**, see §3 |
`App.tsx:124` | `const { shortName } = await sdk.safe.getChainInfo()` | EIP-3770 short name | `"trx-shasta"` — **the Tron detector** |
`App.tsx:173,177` | `networkPrefix` / `showNetworkPrefix={!!networkPrefix}` | — | renders `trx-shasta:0x…`, nonsense on Tron |
`sdk-helpers.ts:11` | `toChecksumAddress(recipient)` inside `encodeFunctionCall` | throws on base58 | **blocker** (probed) |
`sdk-helpers.ts:20` | `to: toChecksumAddress(recipient)` (native branch) | throws on base58 | **blocker** |
`sdk-helpers.ts:26` | `to: toChecksumAddress(item.tokenInfo.address)` (token branch) | hex from CGW | fine; `''` would throw |
`abis/erc20.ts:9` | ABI input `type: 'address'` | 20-byte hex, left-padded | **correct for TRC-20 as-is** |
`CurrencyCell.tsx:32,41` | `tokenToTx(safe.safeAddress, item)`, `from: safe.safeAddress` | hex from SDK | fine |
`CurrencyCell.tsx:44` | `web3Utils.fromWei(gasCostInWei, 'ether')` | ÷1e18 | **wrong**: TRX is 6 decimals |
`use-balances.ts:14-16` | `transferableTokens` fiat filter | — | **drops all TRX**, see §3 |

**No address is ever rendered** in drain-safe. `Balances.tsx:39-90` shows logo/name/amount/fiat only; `tokenInfo.address` is a row key (`:98`), never displayed. The recipient `AddressInput` is the app's *entire* display surface for addresses.

---

## 3. Gap analysis

### G1 — CRITICAL · Native TRX is silently excluded from "Transfer everything"

`use-balances.ts:14-16`:
```ts
const transferableTokens = (item: TokenBalance) =>
  item.tokenInfo.type !== NATIVE_TOKEN ||
  (item.tokenInfo.type === NATIVE_TOKEN && Number(item.fiatBalance) !== 0)
```
Live probe (2026-08-05): `GET /v1/chains/2494104990` → `balancesProvider: {chainName: null, enabled: false}`; `GET /v1/chains/2494104990/safes/0xD72c8d27d0F45173d3178E35B2d496F56a407fF7/balances/USD` → `{"fiatTotal":"0","items":[{"tokenInfo":{"type":"NATIVE_TOKEN","address":"0x0000000000000000000000000000000000000000","decimals":6,"symbol":"TRX","name":"TRON"},"balance":"1000000","fiatBalance":"0","fiatConversion":"0"}]}`. The predicate is false → TRX is filtered out of `assets` → not rendered, not in the default selection (`:37`), not swept (`App.tsx:44`). A TRX-only Safe shows "You don't have any transferable assets" (`App.tsx:189`). **This is a funds-safety defect, not cosmetic**: a user who clicks "Transfer everything" and sees success has left 100% of their native balance behind.

**The existing suite encodes the opposite behaviour.** `__tests__/App.test.js:166-181`, `it('Filter native token without value')`, sets `balances[0].fiatBalance = '0.00000'` while leaving `balance: '949938510499549077'` and asserts `document.querySelectorAll('.MuiDataGrid-row').length === 4`. Under the §4.3 fix that becomes 5 rows and the test goes red. It also mutates the shared fixture in place (`let balances = mockInitialBalances; balances[0].fiatBalance = …`), so the mutation leaks into every test that runs after it. Both must be fixed **inside commit 1** — see §4.3 and §4.8.

### G2 — CRITICAL · Batching is load-bearing and MultiSend is unconfigured in the chain config

`App.tsx:42-49` emits one tx per selected asset; the host wraps `txs.length > 1` in MultiSendCallOnly. Unlike tx-builder, where a 1-tx batch is the norm, an N-asset drain is *inherently* N txs. Live: `contractAddresses` is `{safeSingletonAddress: null, multiSendAddress: null, multiSendCallOnlyAddress: null, …}` — **all nine null**. Since a `SafeL2 1.4.1+L2` singleton demonstrably *is* deployed on Shasta (Report D: `0x2E6355A073170c38b778AF539B8F11E207CA4e30`), this most likely means "gateway config unpopulated, host resolves elsewhere" rather than "not deployed". Either way it is **unverified and blocking** — see §5 R1.

### G3 — HIGH · The recipient field rejects `T…`, and it is the library component

`App.tsx:52` → probed `web3Utils.isAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') === false`. The library `AddressInput` does *not* crash on base58 — its internal `checksumValidAddress` is guarded by `isValidAddress = isHexStrict && isAddress` (recovered from `apps/drain-safe/node_modules/@gnosis.pm/safe-react-components/dist/index.min.js.map`, `src/utils/address.ts`), and `isValidEnsName = /[^\[\]]+\.[^\[\]]/` doesn't match a dot-less `T…`, so the string passes through untouched and dies at the validator with the generic message. drain-safe's `components/AddressInput.tsx` is **17 lines of `styled()`** over a prebuilt bundle — **not patchable in-tree**.

### G3b — HIGH · The vendored field's stylesheet reads a theme drain-safe does not have

New, and blocking for §4.2. `apps/tx-builder/src/components/forms/fields/styles.ts` (125 lines) makes **17 theme reads**, all against an MUI v5 shape:

| Read | Lines |
|---|---|
`theme.palette.error.main` | 9, 25, 95, 109, 118, 122 |
`theme.typography.fontFamily` | 16, 60 |
`theme.palette.text.secondary` | 17 |
`theme.palette.text.primary` | 50, 56, 61 |
`theme.palette.border.main` | 22, 76 |
`theme.palette.border.light` | 76, 85, 91, 109 |
`theme.palette.background.paper` | 52 |

`palette.border` is not stock MUI — it is tx-builder's own augmentation (`theme/lightPalette.ts:18 border: {main,light,background}`), fed through `theme/SafeThemeProvider.tsx` → `createSafeTheme` and injected into styled-components at `apps/tx-builder/src/index.tsx:16-18`; in tests via `apps/tx-builder/src/test-utils.tsx`, which re-mounts the same `SafeThemeProvider`.

drain-safe's styled-components theme is the components-library theme (§2) — no `palette`, no `typography`. So `theme.palette.error.main` is a property access on `undefined` and **the field throws a `TypeError` on first render**, taking the whole app down. Same in tests: `mockTheme` has no `palette` either, so a copied `AddressInput.test.tsx` fails identically. Nothing catches it at compile time: this repo declares no `DefaultTheme` augmentation (grepped — only `Button.tsx` mentions the type, and only as a generic parameter), so styled-components' `AnyIfEmpty<DefaultTheme>` widens `theme` to `any`. I confirmed `tsc --noEmit` on `styles.ts` in isolation reports zero errors. Resolution in §4.2.

### G4 — HIGH · `toChecksumAddress` throws in the tx-building path

`sdk-helpers.ts:11`, `:20`, `:26`. Probed: `toChecksumAddress('TR7NHqje…')` → `Given address "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" is not a valid Ethereum address.` Loosening G3's validator *without* normalising first converts a validation message into a thrown submit. Normalisation must land at the ingress boundary, per policy — and, critically, the **same** normalized value must be what reaches `tokenToTx` (§4.4).

### G5 — MEDIUM · EIP-3770 prefix is rendered on Tron

`App.tsx:177` `showNetworkPrefix={!!networkPrefix}` with `networkPrefix === 'trx-shasta'` → the field shows `trx-shasta:0x…`. A base58 address is not an EIP-3770 address; tx-builder explicitly suppresses this (`TransactionBatchListItem.tsx:118`, `TransactionDetails.tsx:52,63`).

### G6 — MEDIUM · Fee-estimate math hardcodes 18 decimals

`CurrencyCell.tsx:43-44`: `gasPrice × estimatedGas` is SUN×energy, then `fromWei(…, 'ether')` divides by 1e18. Live `nativeCurrency.decimals` is **6**, so the cost is understated by 1e12 and the "costs more than it's worth" warning can never fire. Currently *masked* by G1 (`ethFiatPrice === 0` gates `showWarningIcon` at `:58`) — so the feature is inert today and will ship wrong the day a price feed lands.

### G7 — MEDIUM · `ethFiatPrice` assumes `assets[0]` is native

`App.tsx:119` `const ethFiatPrice = Number(assets[0]?.fiatConversion || 0)`. Pre-existing latent bug: true only because CGW returns native first *and* G1's filter hasn't removed it. Fix G1 and this becomes correct again on Tron by accident; make it explicit anyway.

### G8 — LOW · ENS is dead code that costs two bridge round-trips per dotted keystroke

`App.tsx:102-105` passes `getAddressFromDomain`. Live `ensRegistryAddress: null`. `web3-eth-ens/lib/ENS.js:465-487 checkNetwork()` does an `eth_getBlock('latest')` freshness check (rejects if head > 3600s old), then `getNetworkType()` → Tron's genesis hash matches none of the five hardcoded Ethereum networks → `'private'` → `throw new Error("ENS is not supported on network private")`. The library catches it and falls back to `onChangeAddress(address)`, so it degrades silently — but `useWeb3` + the undeclared `web3` dep + all eight node polyfills in `config-overrides.js:8-27` exist **solely** for this path.

### G9 — LOW · Hardcoded ETH branding in the fallback token

`Balances.tsx:13-20`: `symbol:'ETH'`, `name:'Ether'`, `decimals:18`, `logoUri:'./eth.svg'`. Used only when `item.tokenInfo` is falsy (`:95`); CGW supplies TRX/6/logoUri correctly, so it should never fire — but it would display "Ether" for TRX if it did.

### G10 — LOW · Undeclared runtime dependencies

`web3-utils` (`App.tsx:4`, `sdk-helpers.ts:1`, `CurrencyCell.tsx:6`) and `web3` (`useWeb3.ts:2`) are **not in `apps/drain-safe/package.json`** (verified: deps are exactly `@gnosis.pm/safe-react-components ^1.2.0`, `@material-ui/core ^4.12.4`, `@mui/x-data-grid 4.0.2`, `@safe-global/safe-apps-provider ^0.18.0`, `bignumber.js ^9.1.1`, `web3-eth-abi ~1.8.1`). They resolve only via root hoisting — `web3` reaches drain-safe *because `apps/tx-builder/package.json:21` declares it*. Removing tx-builder's web3 dep breaks drain-safe's build. Note `@mui/material` is in the same position: **no app declares it**; 5.10.12 sits at the root only because `@mui/x-data-grid` pulls it (tx-builder imports `@mui/material/styles` on that hoist alone). This matters for §4.2 option (b), which is why §4.2 does not take it.

### G11 — INFO · Zero Tron awareness, and a conflicting local branch

`grep -ril "tron|base58|shasta" apps/drain-safe/src` → **no hits**. But local-only branch `feat/drain-safe-native-balance-filter` (verified present, not on origin, cut from `cca6f79` — *before* the four base58 commits) already contains: the G1 fix (`use-balances.ts`: filter on `Number(item.balance) !== 0`, with a good comment), a `Value`-column hide when `ethFiatPrice === 0` (`Balances.tsx`), a `beforeEach` + `stubBalances` deep-copy helper that fixes the fixture-mutation leak, the two-way rewrite of `it('Filter native token without value')`, an 825-line `TRON_DEPLOYMENT.md`, Tron fixtures, **and a `TRON_BASE58_ADDRESS` regex guard in `App.tsx` that *rejects* base58** with *"Tron base58 (T…) addresses are not supported here — paste the 0x… hex form"* plus a test asserting that message. That rejection contradicts the policy that landed afterwards. **Salvage the balance filter, the test-isolation harness, the two rewritten filter tests and the fixtures; delete the rejection guard and its test, and the runbook's hand-conversion instructions.**

### Non-gaps (verified, do not touch)

- **TRC-20 calldata is already correct.** Selector `a9059cbb` is identical (TVM computes selectors as `keccak256(sig)[0:4]`); `address` params are canonical EVM — 20 bytes left-padded with 12 zero bytes, **no `0x41`** (TRON's [Parameter Encoding](https://developers.tron.network/docs/parameter-encoding-and-decoding); TronWeb's own encoder does `value.replace(/^(41)/, '0x')` before calling a standard `AbiCoder`). Ignore TRON's [TRC-20 Contract Interaction](https://developers.tron.network/docs/trc20-contract-interaction) doc, which shows `41` *inside* the padding — that legacy HTTP-API form only works because Solidity's decoder ignores dirty high-order bits, and it breaks strict decoders.
- **Native TRX transfer semantics.** `execTransaction` with `value > 0`, `data: '0x'` moves TRX exactly as ETH. `sdk-helpers.ts:18-23` needs no semantic change.
- **Token addresses from CGW.** Already hex (probed: `0x42a1e39aefA49290F2B3F9ed688D7cecf86CD6E0` for Shasta USDT, mixed-case EIP-55-shaped). Never displayed → no conversion needed.
- **`sdk.eth.getGasPrice` / `getEstimateGas`.** Both supported by Tron's JSON-RPC. Errors are already swallowed (`CurrencyCell.tsx:49-51`).

---

## 4. Implementation plan

### 4.0 Conversion boundaries — the contract, stated once

| | Form | Enforced at |
|---|---|---|
| **Ingress** (user paste) | base58 → hex, immediately | `AddressInput`'s `checksumValidAddress` (vendored) + belt-and-braces `normalizeTronAddress` in `App.tsx`'s `onToAddressChange` |
| **App state** (`toAddress`) | **hex** | invariant |
| **Submit** (`submitTx` → `sendTxs` → `tokenToTx`) | **hex**, the *same* normalized value that was validated | one `const recipient` in `submitTx`, threaded through — see §4.4 |
| **ABI calldata**, `tx.to`, `tx.value` | **hex** | `sdk-helpers.ts` — unchanged semantics |
| **Selection keys / DataGrid row ids** | **hex** | `App.tsx:44,71`, `use-balances.ts:37`, `Balances.tsx:36,98` — these are *identity*, never display; must NOT be converted |
| **`sdk.txs.send`, `sdk.eth.*`** | **hex** | the SDK does not enforce it (`txs/index.js:31-41`); the host and Tx Service do |
| **Egress** (the one field a human reads) | **base58**, no `trx-shasta:` prefix | `toInputValue` in the vendored `AddressInput` |

No `T…` string exists anywhere except inside the input element's `value` and inside `tronAddress.ts`.

### 4.1 New files — copy verbatim from tx-builder, zero new dependencies

| New | Source | Why verbatim |
|---|---|---|
`apps/drain-safe/src/utils/tronAddress.ts` | `apps/tx-builder/src/utils/tronAddress.ts` (200 lines) | Only import is `./sha256`. No app coupling. |
`apps/drain-safe/src/utils/sha256.ts` | `apps/tx-builder/src/utils/sha256.ts` (103 lines) | Zero imports. Hand-rolled because base58check needs double-SHA-256 and `web3-utils` is keccak-only; also avoids a `crypto.subtle` polyfill in `setupTests.ts`. |
`apps/drain-safe/src/utils/tronAddress.test.ts` | ditto (163 lines) | |
`apps/drain-safe/src/utils/sha256.test.ts` | ditto (47 lines, NIST vectors) | |

**Copy, do not import across apps.** Root `package.json:25-27` sets `workspaces: ["apps/*"]`; there is no `packages/`/`libs/`, and no app's `config-overrides.js` removes CRA's `ModuleScopePlugin`, so `../../tx-builder/src/utils/tronAddress` is rejected at build time. A shared workspace package would be cleaner but has no precedent on this branch — flag it as follow-up, don't invent it here.

I re-ran the real module to confirm the API before planning against it:
```
hexToTronBase58('0xD72c8d27d0F45173d3178E35B2d496F56a407fF7') → TVawencjV9rskqDTxG4XrKeUQhDV6GNPDU
tronBase58ToHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')         → 0xa614f803b6fd780986a42c78ec9c7f77e6ded13c
hexToTronBase58('0x0000…0000')                                → T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb
hexToTronBase58('')                                           → undefined      (no throw)
toDisplayAddress('', 'trx-shasta')                            → ''             (safe for the native `''` address)
tronBase58ToHex('TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwY')          → undefined      (1-char typo rejected)
normalizeTronAddress('Txxx')                                  → 'Txxx'         (junk passes through untouched)
isTronNetworkPrefix('trx' | 'trx-shasta' | 'eth')             → true | true | false
```
That last line is the load-bearing property: `normalizeTronAddress` returns non-addresses **unchanged**, so every existing call site keeps reporting its own error for half-typed input.

### 4.2 Vendor the Tron-aware `AddressInput` (the only structurally hard part)

drain-safe's `components/AddressInput.tsx` wraps a **prebuilt** `dist/index.min.js`. The published component's two reconciliation effects will keep re-asserting hex and re-adding `trx-shasta:` no matter what props you pass — that cannot be fixed from outside. tx-builder solved it by forking; the fork's prop surface is **identical** to the library's `dist/inputs/AddressInput/index.d.ts`, so it is a drop-in.

Copy this closure into `apps/drain-safe/src/`:

| Copy to | From | Lines | Verbatim? |
|---|---|---|---|
`src/components/fields/AddressInput.tsx` | `apps/tx-builder/src/components/forms/fields/AddressInput.tsx` | 248 | yes (fix import depths) |
`src/components/fields/TextFieldInput.tsx` | ditto `TextFieldInput.tsx` | 57 | yes (fix import depths) |
`src/components/fields/styles.ts` | ditto `styles.ts` | 125 | **no — rewrite, see below** |
`src/utils/address.ts` | `apps/tx-builder/src/utils/address.ts` | 59 | yes |
`src/hooks/useThrottle.ts` | `apps/tx-builder/src/hooks/useThrottle.ts` | 26 | yes |

Import closure verified: `@material-ui/core/{InputAdornment,CircularProgress,TextField}` (drain-safe declares `^4.12.4` ✓), `styled-components` (root `package.json:34` `^5.3.6` ✓), `web3-utils` (**must be declared** — see §4.6), `./styles`, `../../utils/{address,tronAddress}`, `../../hooks/useThrottle`. Note this is *module resolution* only — the theme object those modules read is a separate question, resolved next.

#### 4.2a `styles.ts` must be rewritten, not copied — the decision

Per G3b, a verbatim copy throws on first render. Three options were on the table:

| Option | Verdict |
|---|---|
| (a) Rewrite `styles.ts` against the components theme | **chosen** |
| (b) Wrap only the field in a nested MUI-shaped `ThemeProvider` | rejected — needs `createSafeTheme`, `lightPalette`/`darkPalette` and `SafeThemeProvider` copied in too, *and* a `@mui/material` declaration drain-safe does not have (5.10.12 is a `@mui/x-data-grid` hoist, G10). Large surface for a stylesheet. |
| (c) Drop `styles.ts`, keep only the wrapper's 16 lines of CSS | rejected — those 16 lines style `.MuiFormLabel-root` colours only; the outlined-input border, focus/error states, autofill and placeholder all come from `styles.ts`. Without it the field is a bare MUI v4 outlined `TextField` and visibly regresses. |

**Write `apps/drain-safe/src/components/fields/styles.ts` as tx-builder's file with every `theme.palette.*` / `theme.typography.*` read replaced by its components-theme equivalent.** The mapping is total — every value has a counterpart:

| tx-builder (MUI v5) | drain-safe (`@gnosis.pm/safe-react-components` theme) | styles.ts lines |
|---|---|---|
`theme.palette.error.main` | `theme.colors.error` | 9, 25, 95, 109, 118, 122 |
`theme.typography.fontFamily` | `theme.fonts.fontFamily` | 16, 60 |
`theme.palette.text.secondary` | `theme.colors.placeHolder` | 17 |
`theme.palette.text.primary` | `theme.colors.text` | 50, 56, 61 |
`theme.palette.border.main` | `theme.colors.inputFilled` | 22, 76 |
`theme.palette.border.light` | `theme.colors.separator` | 76, 85, 91, 109 |
`theme.palette.background.paper` | `theme.colors.white` | 52 |

Everything else in the file (the `hiddenLabel` clip trick, the `disabled` cursor, the literal `#dadada`/`#b2bbc0`) is theme-independent and copies unchanged. This keeps the field consistent with the rest of drain-safe's chrome (`Title`, `Text`, `Icon`, `Tooltip`, `DataTable` all read this same shape) instead of importing tx-builder's palette into an app that has no other MUI-v5 surface. It also removes the theme-drift risk from R8 entirely — nothing in the vendored closure reads a shape drain-safe doesn't own.

Two follow-through requirements:

1. **Extend `mockTheme` (`src/utils/test-helpers.tsx:4-46`)** with the `colors` keys the rewritten file reads — `text`, `error`, `placeHolder`, `inputFilled`, `separator`, `white` — alongside the existing `colors.disabled`. Without them the interpolations yield `undefined` (harmless in CSS, unlike the missing-`palette` `TypeError`), but a stylesheet silently emitting `color: undefined` in every test is not a state worth shipping.
2. **Do not rely on TypeScript here.** With no `DefaultTheme` augmentation, `theme` is `any` in every one of these files; a wrong key name is a runtime-only defect. The `AddressInput.test.tsx` copied in §4.8 is the only thing that will catch it — make sure it renders the field under `renderWithProviders`, i.e. under `mockTheme`, not a bare mount.

#### 4.2b Rewire the wrapper

Rewrite `src/components/AddressInput.tsx` to keep the same 16 lines of `styled()` CSS but wrap the **local** component instead of the package one:
```ts
import styled from 'styled-components'
import AddressInput from './fields/AddressInput'   // was: from '@gnosis.pm/safe-react-components'
export default styled(AddressInput)`…unchanged…`
```
drain-safe passes `id`, `name`, `label`, `hiddenLabel`, `networkPrefix`, `address`, `onChangeAddress`, `showNetworkPrefix`, `getAddressFromDomain` (`App.tsx:169-179`). All are accepted: `hiddenLabel = false` is a declared param (`AddressInput.tsx:47`), `label` arrives via `TextFieldInputProps`, and `id` falls through `...rest` (`:48`).

The three mechanisms the fork already carries — do not re-derive them:
1. `checksumValidAddress` (`:199-210`) = `normalizeTronAddress` → `isValidAddress` → `checksumAddress`. The ingress conversion.
2. `toInputValue` (`:216-226`) = base58 on Tron with **no prefix**, `addPrefix` elsewhere. The egress conversion, and it makes G5 disappear automatically.
3. The two `isTron`-gated effects: "changed from outside" compares the field against `toInputValue(address, …)` rather than raw state (`:102-113`) — comparing raw would rewrite the field mid-typing; and the network-switch effect skips pushing state when `normalizeTronAddress(fieldText).toLowerCase() === address.toLowerCase()` (`:138-148`) — otherwise it re-pushes identical hex every render and dirties a pristine field. Non-Tron behaviour is byte-identical.

Version drift, for the record: tx-builder pins `@gnosis.pm/safe-react-components` **`1.1.5`** exactly (`apps/tx-builder/package.json:7`) while drain-safe declares `^1.2.0` and resolves 1.2.0 nested at `apps/drain-safe/node_modules/` (root hoist is 0.9.8 for the older apps). With `styles.ts` rewritten against 1.2.0's own theme, the vendored closure no longer shares *anything* with the package except `styled-components` itself — the fork imports `@material-ui/core` directly. Only `Icon`/`Tooltip`/`DataTable`/`Title`/`Text` still come from the package elsewhere and none is affected.

**The `2bd50f9` trap does not bite today** — drain-safe's wrapper passes no `inputProps={{ value }}`, so the field stays uncontrolled. Add a comment saying so; the moment a wrapper passes `value`, React re-asserts raw hex every render and overrides the ref (the symptom in that commit: one screen showing `TPbuyAoB…` in one box and `0x958ACE…` in another).

### 4.3 `src/hooks/use-balances.ts` — G1, the funds-safety fix

Replace the fiat clause at `:14-16` with a balance clause (salvage the version already written on `feat/drain-safe-native-balance-filter`):
```ts
const transferableTokens = (item: TokenBalance) =>
  item.tokenInfo.type !== NATIVE_TOKEN ||
  // Drainability is a function of BALANCE, not of fiat value: a chain without a price feed
  // reports fiatBalance "0" for every asset, which silently hid the entire native balance
  // from a "transfer everything" sweep.
  (item.tokenInfo.type === NATIVE_TOKEN && Number(item.balance) !== 0)
```
Chain-agnostic (no Tron branch) and strictly better on Ethereum too: the clause existed only to hide dust-valued ETH, and hiding an asset from a *drain* on the grounds that it's cheap was always the wrong trade. A zero *balance* is still hidden.

**This change breaks `__tests__/App.test.js:166-181` and must ship with its replacement in the same commit.** The existing test asserts the fiat filter directly (`fiatBalance = '0.00000'`, `balance` untouched, expect 4 rows) — under the new predicate that fixture yields 5. The required edits, all already written on the local branch and to be rebased as-is:

1. Replace `it('Filter native token without value')` with **two** tests: `it('Lists the native token even when it has no fiat value')` (zero fiat, real balance → 5 rows, `Ether` present) and `it('Filters the native token out when its balance is zero')` (`balance = '0'` → 4 rows, `Ether` absent). Together they pin the new intent from both sides.
2. Add a `stubBalances(items)` helper that stubs `experimental_getBalances` with `JSON.parse(JSON.stringify(items))`, plus a `beforeEach` that calls `stubBalances(mockInitialBalances)` and `sdk.txs.send.mockClear()`. This closes the pre-existing fixture-mutation leak (`let balances = mockInitialBalances` mutated the shared array in place, so `mockInitialBalances[0].fiatBalance` stayed `'0.00000'` for anything running afterwards) and is the reason the two new tests can each mutate a copy safely.

### 4.4 `src/components/App.tsx`

| Line | Change |
|---|---|
`:35` (new) | `const isTron = isTronNetworkPrefix(networkPrefix)` — derived from the `shortName` already fetched at `:124`. No new SDK call. |
`:42-49`, `:51-55` | **Normalize once, validate that value, submit that value.** `sendTxs` currently closes over `toAddress` and takes no argument; give it a `recipient: string` parameter and compute the value once in `submitTx`: `const recipient = normalizeTronAddress(toAddress); if (!web3Utils.isAddress(recipient)) { setError('Please enter a valid recipient address'); return } … await sendTxs(recipient)`, with `sendTxs` calling `tokenToTx(recipient, item)` at `:45`. See the note below — validating `:52` while submitting raw `:45` is worse than not normalizing at all. |
`:84-87` | `onToAddressChange`: `setToAddress(normalizeTronAddress(address))`. Ingress belt — makes the hex invariant hold even if the field is ever swapped back. |
`:102-105`, `:178` | Pass `getAddressFromDomain={isTron ? undefined : getAddressFromDomain}`. Kills G8's two-round-trip-per-dotted-keystroke path. The `useWeb3`/`web3` machinery stays for non-Tron chains — do **not** rip it out in this change (that's a separate cleanup with a real bundle win, since it also frees the eight polyfills in `config-overrides.js:8-27`). |
`:119` | `const ethFiatPrice = Number(assets.find(a => a.tokenInfo.type === NATIVE_TOKEN)?.fiatConversion || 0)` — G7. Correct regardless of CGW ordering or filtering. |
`:177` | Leave `showNetworkPrefix={!!networkPrefix}` **as is**. `toInputValue` (`AddressInput.tsx:223-225`) already routes Tron past `addPrefix`, so G5 is fixed inside the field. Adding `&& !isTron` here would be harmless but redundant — pick one place, and the field is the right one. |

**Why the one-`const` form and not "normalize at `:52` only".** An earlier draft of this plan changed `:52` to `isAddress(normalizeTronAddress(toAddress))` and deliberately left `:45` alone, on the grounds that `toAddress` is already hex by the ingress boundaries. Those two positions are mutually exclusive. The *only* scenario the `:52` normalize exists for is state holding a base58 string that never passed through `onToAddressChange` — and in exactly that scenario the loosened guard now **passes** (normalize → valid hex), `:45` hands the raw `T…` to `tokenToTx`, and `sdk-helpers.ts:20`/`:11` throws `Given address "T…" is not a valid Ethereum address.`, which `App.tsx:62-65` surfaces as *"Failed sending transactions: …"*. Today, unmodified, that same input is cleanly rejected at `:52`. So the belt-and-braces guard would make the failure mode strictly worse. Compute `recipient` once, validate it, thread it — or don't normalize at `:52` at all and rely solely on the field. The first is one extra parameter; take it.

`isTron` is not used in the submit path at all: `normalizeTronAddress` is a no-op on hex and on junk, so the path stays chain-agnostic.

### 4.5 `src/utils/sdk-helpers.ts`, `src/components/CurrencyCell.tsx`, `src/components/Balances.tsx`

- **`sdk-helpers.ts` — no address change.** All three `toChecksumAddress` calls (`:11`, `:20`, `:26`) receive hex once §4.4 holds, and the golden vectors in `__tests__/sdk-helpers.test.js:14-24` plus the exact throw message at `:26-31` must stay byte-identical. Do **not** move `normalizeTronAddress` in here — conversion happens on input, not on submit (`TRON_DEPLOYMENT.md:474-477`), and doing it here would let a `T…` string live in app state, breaking the invariant that makes review screens and batch files coherent. Optional hardening: guard `:26` against `item.tokenInfo.address === ''`, which currently throws for the `Balances.tsx:19` stub shape.
- **`CurrencyCell.tsx:43-46` — G6.** Replace `web3Utils.fromWei(gasCostInWei.toString(), 'ether')` with a decimals-driven divide using `nativeCurrency.decimals` from `sdk.safe.getChainInfo()` (thread it down beside `gasPrice`/`ethFiatPrice`, or reuse `formatTokenValue(value, decimals)` from `utils/formatters.ts:3-5`, which is exactly `new BigNumber(value).times('1e-'+decimals)`). Chain-agnostic; no Tron branch. Note the warning stays inert on Tron until a price feed exists (`showWarningIcon` requires `ethFiatPrice > 0`, `:58`) — fix the units anyway so it isn't wrong on day one when prices land.
- **`Balances.tsx` — G9, optional.** Either delete the `ethToken` stub (`:13-20`) and the `|| ethToken` fallback (`:95`) as dead code, or derive it from `getChainInfo().nativeCurrency`. Also salvage the local branch's "hide the `Value` column when `ethFiatPrice === 0`" change — a `$0.00` column beside real balances on a chain with no price feed is actively misleading.

### 4.6 Dependencies

- **Add `"web3-utils": "~1.8.1"` to `apps/drain-safe/package.json:5-11`.** Fixes G10 for the file that matters: the vendored `utils/address.ts` imports it directly, and today it resolves only by hoist-luck through `web3-eth-abi` and the components package. Match the resolved 1.8.1 exactly so no second copy enters the bundle.
- **No `@mui/material` needed** — a consequence of the §4.2a decision. The vendored closure imports `@material-ui/core` (v4, declared) and reads the components theme; nothing touches MUI v5. Had option (b) been taken, `@mui/material@5.10.12` would have had to be declared, since drain-safe gets it only via `@mui/x-data-grid`'s hoist.
- **Add nothing else. No `tronweb`, no `bs58`/`bs58check`.** tx-builder added **zero** dependencies across nine commits (`git diff protofire-stg..HEAD -- package.json` touches only the two `*:tron` scripts). `tronweb` also pulls ethers, and its `TronWeb.address.toHex()` returns the **41-prefixed** 21-byte form — you'd still have to strip `41` before `web3-eth-abi` or the CGW, so it buys nothing over the 200-line in-repo codec.
- Consider declaring `web3` too (`useWeb3.ts:2`), or better, note in the follow-up cleanup that dropping ENS lets `web3`, `web3-eth-ens` and eight browser polyfills go entirely.
- **Skip `.env.tron.shasta` / `build:tron` for drain-safe.** tx-builder needed it for exactly one variable, `REACT_APP_GATEWAY_BASE_URL` (`.env.tron.shasta:26`), used only by its ABI-lookup path. drain-safe reads **no** `REACT_APP_*` at all — verified — and gets balances through the bridge. An empty env file and a script that sources it are pure ceremony. (This has a direct consequence for the verifier — see §4.7.)

### 4.7 Chain detection — Shasta and Mainnet

**Detect by `shortName`, never by chainId.** `isTronNetworkPrefix(prefix)` = `prefix === 'trx' || prefix.startsWith('trx-')` (`tronAddress.ts:177-178`, probed true/true/false for `trx`/`trx-shasta`/`eth`). drain-safe already has the value at `App.tsx:124`; live `GET /v1/chains/2494104990` confirms `shortName: "trx-shasta"`.

Why not chainId: **there is no chainId anywhere in this repo's source** — the only occurrences are documentation (`TRON_DEPLOYMENT.md:12,275`, `.env.tron.shasta:5`). Hardcoding `2494104990` would need a second constant for mainnet the day it lands, whereas `'trx'` already covers mainnet by construction. Note that `App.tsx` uses `safe.chainId` only as a `useCallback` guard (`use-balances.ts:18,26,43`) — and the test mock sets it to the *string* `'chainId'` (`App.test.js:37`), which is a fair warning against ever branching on it.

For reference in docs, fixtures and registration only — **not source**:

| Network | Decimal | Hex | `shortName` | Gateway status |
|---|---|---|---|---|
Tron Mainnet | 728126428 | `0x2b6653dc` | `trx` | **absent** — `/v1/chains` returns `count: 1` |
Shasta | 2494104990 | `0x94a9059e` | `trx-shasta` | live, the only chain served |
Nile | 3448148188 | `0xcd8690dc` | `trx-nile` | absent |

(These aren't arbitrary: TVM's `CHAINID` returns the last 4 bytes of the genesis block hash.) **Mainnet is not end-to-end testable from this repo today.** The code will work on it unchanged the moment a gateway appears; don't pre-emptively hardcode anything to compensate.

Registration shape to copy, probed live from the existing entry: `GET /v1/chains/2494104990/safe-apps` → `Transaction Builder`, `url: https://dev-tron-apps.safe.protofire.io/tx-builder/`, `chainIds: ["2494104990"]`, `accessControl: {type: "NO_RESTRICTIONS"}`. Note the host bucket **moved** since `TRON_DEPLOYMENT.md` §1 was written (`dev-apps` → `dev-tron-apps`) — target the current one. `public/manifest.json` has no chain fields and needs no change.

**Deployment verification — run `scripts/verify_safe_app_deployment.mjs` WITHOUT `--expect-gateway`, and expect 6 checks, not 7.** The script's check names are `https`, `root`, `framing`, `manifest`, `manifest-cors`, `icon`, and — only when `--expect-gateway <url>` is passed (`:384-386`) — `gateway`. `checkBakedGateway` (`:401-444`) downloads the scripts referenced by the app root and recovers the value CRA inlined for `REACT_APP_GATEWAY_BASE_URL`; `extractBakedGatewayUrl` (`:222-227`) is deliberately keyed on that exact variable name so the gateway SDK's own `DEFAULT_BASE_URL` cannot masquerade as a match. Per §4.6, drain-safe reads no `REACT_APP_*` and gets no `.env.tron.shasta`, so **a drain-safe bundle bakes nothing** and the check would return `['gateway', false, 'no REACT_APP_GATEWAY_BASE_URL is baked into the bundle … the app was built with the variable unset']` (`:436-441`) — a guaranteed failure, by this plan's own design. The runbook's pass condition must therefore read *"6 checks, all passing"* and say explicitly that `--expect-gateway` does not apply to drain-safe and why. If drain-safe ever grows a `REACT_APP_GATEWAY_BASE_URL`, re-enable the flag and the count goes back to 7.

### 4.8 Tests

**Must not change** — these are the encoding contract, and a suite that stays green apart from the two named rewrites is the proof the Tron work is additive:
- `__tests__/sdk-helpers.test.js:14-24` golden calldata (`0xa9059cbb` + left-padded 32-byte word + `3e8`); `:26-31` the exact `web3-utils` throw message; `:34-58` ERC-20 branch; `:60-74` native branch (note `tokenInfo: {type:'NATIVE_TOKEN', address: null}` — the code must keep tolerating a null token address).
- `App.test.js:56-66` full drain against `mockTxsRequest`; `:68-88` partial drain; `:90-97` empty-recipient error; `:99-141` DataGrid sorting; `:143-164` the MKR gas-cost warning row.

**Required rewrites (not optional salvage) — these belong to commit 1, alongside §4.3:**
1. `App.test.js:166-181` `it('Filter native token without value')` → the two tests described in §4.3 (`Lists the native token even when it has no fiat value` → 5 rows; `Filters the native token out when its balance is zero` → 4 rows). The old assertion encodes the fiat filter that G1 removes; leaving it in makes commit 1 land red.
2. `App.test.js` fixture isolation: the `stubBalances` deep-copy helper + `beforeEach`. Required because the old test mutated `mockInitialBalances` in place and the leak affects every later test once the filter changes.

**New (commit 2 onwards):**
3. `src/utils/tronAddress.test.ts` + `sha256.test.ts` — copied verbatim (163 + 47 lines), including the `TSqF5pn9…Z` → `…Y` single-char-typo rejection vector.
4. `src/components/fields/AddressInput.test.tsx` — copy tx-builder's. Two harness requirements, both load-bearing: (i) the test must **hold the address in `useState` and feed it back** (`AddressInput.test.tsx:19-47`), the way `App.tsx` does — with a stub `onChangeAddress` the sync effects never run and the test proves nothing; (ii) retarget its `render` import from tx-builder's `test-utils` (which mounts `SafeThemeProvider`) to drain-safe's `renderWithProviders` (`src/utils/test-helpers.tsx:150-154`, which mounts `mockTheme`) — **this is also the only automated check that the rewritten `styles.ts` reads keys that exist**, since TypeScript types the theme as `any` (§4.2a).
5. **New Tron `App.test.js` block** — a second `useSafeAppsSDK` mock with `getChainInfo → {chainId: 2494104990, shortName: 'trx-shasta', nativeCurrency: {symbol:'TRX', decimals: 6}}` plus a fixture set mirroring the live response: TRX native at `0x000…0`, 6 decimals, `fiatBalance: "0"`, `fiatConversion: "0"`, and a 6-decimal TRC-20. Assert: (a) **TRX appears and is selected by default** — the G1 regression, and the single most important new test; (b) pasting `TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ` produces `txs[].to === '0xB8F88C79d2d655A0acAf5982A13028dDf7628EBe'` (probed checksum casing) with **no** `T…` string in the `txs.send` payload; (c) the field renders base58 with **no** `trx-shasta:` prefix; (d) a 1-char-typo base58 yields "Please enter a valid recipient address" and no send; (e) `getAddressFromDomain` is not invoked on a Tron chain. Salvage the fixtures already written on `feat/drain-safe-native-balance-filter` (`test-helpers.tsx` +51: `mockZeroFiatBalances`, `mockZeroFiatTxsRequest`; `App.test.js` +108) — **but delete its `it('rejects a Tron base58 recipient with an actionable message')` test**, which asserts the opposite policy.
6. `src/utils/test-helpers.tsx` — add the Tron fixture set alongside `mockInitialBalances` (`:78-148`), and extend `mockTheme` (`:4-46`) with the `colors` keys §4.2a introduces. Leave the Ethereum fixtures untouched.
7. **Cypress** (`cypress/e2e/drain-account/drain.spec.cy.js`): today it hardcodes chain 5 / Goerli in the balances intercept (`:13-15`). If a Tron spec is added, `:60-71` (the ENS drain, typing `goerli-test-safe.eth`) is structurally unrunnable on Tron — drop it or replace it with a base58-paste case. Lower priority than the unit work; the manual walkthrough in §5 R1 is what actually de-risks the port.
8. `apps/drain-safe/TRON_DEPLOYMENT.md` — rewrite the salvaged 825-line runbook to the accept-and-convert policy. Its §9.1 currently instructs operators to convert by hand with `TronWeb.address.toHex(...)`; that must go. Its verifier section must state the 6-check / no-`--expect-gateway` pass condition from §4.7. Also re-check its §10 finding (leaked API keys in the served bundle) against the current bundle before republishing. Use tx-builder's structure: probe table → build → hosting requirements → manual walkthrough with explicit pass conditions → per-change source sections.

---

## 5. Risks & open questions

**R1 — Does a multi-asset drain actually execute on Shasta? (highest risk, and it is not an address problem.)**
Unverified. `contractAddresses.multiSendAddress` and `multiSendCallOnlyAddress` are both `null` in the live chain config, yet `safeSingletonAddress` is also `null` while a `SafeL2 1.4.1+L2` singleton demonstrably exists — so the null is probably unpopulated config, not a missing deployment. drain-safe cannot function without batching. **De-risk:** before writing any code, fund a Shasta Safe with TRX **and** a TRC-20, and execute a real 2-asset drain from the *current* tx-builder deployment host by hand-crafting the equivalent batch. If MultiSendCallOnly isn't resolvable, the whole port stalls on a host/config fix and no amount of base58 work helps. Escalate to whoever owns `safe-config-service` for this chain.

**R2 — TVM execution limits on a batched drain.**
Not verified against a real batch. Three Tron-specific ceilings the EVM has no analogue for: a **chain-wide 80 ms wall-clock CPU cap** per transaction (`OUT_OF_TIME`); `fee_limit` capping energy at max 15,000 TRX, where **TronLink's default is far lower**, so a large batch can fail on wallet defaults even with a funded account — and the Safe App cannot set `fee_limit`, the host/wallet does; and **+25,000 energy** when a *contract* transfers TRX to an unactivated account, which is exactly the drain-to-a-fresh-recipient case ([Account](https://developers.tron.network/docs/account)). **De-risk:** drain 5+ assets in one batch on Shasta and record the energy cost; if it fails, the mitigation is smaller batches (a UI/UX change), not a bigger fee. Raise `fee_limit` defaults with the host team.

**R3 — Draining to a contract recipient.**
On TVM, `transfer()`/`send()` forward only 2,300 energy; a recipient contract without a payable `receive`/`fallback` cannot be paid and the transfer reverts. Also, Tron's native `TransferContract` bypasses `fallback` entirely, unlike Ethereum. Drain-to-EOA is fine. **De-risk:** document it; consider a warning if the recipient has code (`sdk.eth.getCode` works — the provider lowercases the hex, `safe-apps-provider/dist/provider.js:92-99`). Out of scope for the first pass.

**R4 — Host-app behaviour is entirely unobserved from this repo.**
Every claim about what happens after `sdk.txs.send` is inference. The SDK is a pure passthrough (`txs/index.js:31-41`, `communication/index.js:52-67` → `postMessage(request, '*')`), so the review screen, MultiSend wrapping, `fee_limit`, and whether the host normalises or rejects addresses are all properties of the Tron Safe{Wallet} fork, which lives outside this repo (siblings `tron-wallet-monorepo`, `private-safe-wallet-monorepo`). **De-risk:** the manual walkthrough in R1 doubles as the host probe — watch what the review screen renders for `to` (hex or base58?) and whether it batches.

**R5 — Fork-vs-vendored divergence.**
`TRON_DEPLOYMENT.md` §8 records a *second*, newer (2.0.0) `apps/tx-builder` vendored inside `protofire/tron-wallet-monorepo@eb90af8` with a **hardcoded** `safe-client.safe.global` gateway. If a vendored drain-safe exists there too, this work lands on the wrong line. **De-risk:** check that monorepo for `drain-safe` **before starting**. Cheap, and cheaper than discovering it after.

**R6 — TRC-20 address encoding: I'm confident, but the vendor's own docs contradict each other.**
The canonical form (12 zero bytes + 20 address bytes, no `41`) is stated by [Parameter Encoding](https://developers.tron.network/docs/parameter-encoding-and-decoding) and matches TronWeb's encoder; the legacy [TRC-20 Contract Interaction](https://developers.tron.network/docs/trc20-contract-interaction) page shows 11 zero bytes + 21 bytes *with* the `41`, which happens to work only because Solidity's decoder ignores dirty high-order bits. **De-risk:** the R1 walkthrough settles it empirically — a successful TRC-20 transfer with unchanged `sdk-helpers.ts` output *is* the proof. If it fails, the calldata is the first place to look, and `__tests__/sdk-helpers.test.js:14-24` tells you exactly what was sent.

**R7 — No price feed means two features ship inert.**
`balancesProvider.enabled: false` → all `fiatBalance`/`fiatConversion` are `"0"`. The gas-cost warning (`CurrencyCell.tsx:57-60`) can never fire, and the `Value` column reads `$0.00`. G6's unit fix is therefore currently untestable end-to-end on Tron. **De-risk:** unit-test the decimals math directly with a synthetic non-zero `ethFiatPrice` rather than waiting for a feed, and hide the `Value` column when `ethFiatPrice === 0` so the UI doesn't assert something false.

**R8 — Visual drift in the rewritten `styles.ts`.**
§4.2a eliminated the *theme-shape* risk (nothing in the vendored closure now reads a shape drain-safe doesn't own) but replaced it with a smaller one: the seven-row mapping from MUI-palette slots to components-theme colours is a judgement call, not a mechanical translation — `border.main → colors.inputFilled` and `text.secondary → colors.placeHolder` in particular. The field will render, and it will look consistent with drain-safe's other chrome, but it will not look pixel-identical to tx-builder's. **De-risk:** the copied `AddressInput.test.tsx` catches a *missing* key (undefined interpolation); only a visual check of the recipient field in light and error states catches a *wrong* key. Do that check as part of commit 2. Residual, unmitigated: `@gnosis.pm/safe-react-components` 1.2.0's theme could rename a `colors` key in a future bump — it is a `dist/theme.d.ts` export, so a version bump would surface it as a TS error nowhere (theme is `any`), only at runtime. Pin the dependency exactly if that worries you.

**R9 — Duplicating `tronAddress.ts`/`sha256.ts` across two apps.**
Now two copies of a 300-line security-relevant codec (base58check *is* the typo protection for the recipient address). A silent divergence is a funds risk. **De-risk:** copy the tests verbatim too, so both copies are pinned to the same vectors; add a one-line header comment in each file naming the other copy; and open a follow-up for a `packages/tron-address` workspace package. Do not build that package as part of this change — `workspaces: ["apps/*"]` (root `package.json:25-27`) would need widening and it would be the branch's first shared package. Note the vendored *field* is a third copy of a different kind: `AddressInput.tsx`/`TextFieldInput.tsx`/`address.ts`/`useThrottle.ts` now exist twice with a **deliberately divergent** `styles.ts`, so a future fix to the field must be applied to both by hand and cannot be a straight `cp`.

**R10 — Merge conflict with the local branch.**
`feat/drain-safe-native-balance-filter` is local-only, cut from before the base58 commits, and contains work worth salvaging alongside a policy decision that must be reverted. **De-risk:** decide explicitly — rebase it onto `protofire-tron-stg`, drop the `TRON_BASE58_ADDRESS` rejection guard *and its test*, and the runbook's hand-conversion section; keep the balance filter, the two rewritten filter tests, the `stubBalances`/`beforeEach` isolation, the `Value`-column change and the Tron fixtures. Do this *first*, as its own commit, so the funds-safety fix (G1) isn't gated on the larger base58 work.

---

### Suggested commit sequence

1. `fix(drain-safe): drain the native balance on chains without a price feed` — G1 (§4.3) **plus** the two rewritten `App.test.js` filter tests and the `stubBalances`/`beforeEach` fixture isolation (§4.8 items 1–2). Rebased from the local branch minus its rejection guard and that guard's test. This is the whole of commit 1: the suite must be green at this commit, which is only true if the test rewrites ship with the predicate change. Ships the funds-safety fix immediately; no Tron code.
2. `feat(drain-safe): accept and display Tron base58 addresses` — §4.1 utils + §4.2 vendored field (**including the rewritten `styles.ts` and the extended `mockTheme`**) + §4.4 App wiring (the single-`recipient` submit path) + §4.6 `web3-utils` declaration + §4.8 items 3–6. Includes the manual visual check of the field per R8.
3. `fix(drain-safe): derive transfer-cost units from the chain's native decimals` — G6 + G7 + G9.
4. `docs(drain-safe): Tron deployment runbook` — the rewritten `TRON_DEPLOYMENT.md`, written *after* the R1 walkthrough so its pass conditions are observed rather than predicted, and stating the 6-check / no-`--expect-gateway` verifier condition from §4.7.

**Key files:** `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/components/App.tsx`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/hooks/use-balances.ts`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/utils/sdk-helpers.ts`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/components/AddressInput.tsx`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/components/CurrencyCell.tsx`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/utils/test-helpers.tsx`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/__tests__/App.test.js`, `/home/den/protofire/safe/safe-react-apps/apps/drain-safe/src/index.tsx`, `/home/den/protofire/safe/safe-react-apps/apps/tx-builder/src/utils/tronAddress.ts`, `/home/den/protofire/safe/safe-react-apps/apps/tx-builder/src/utils/sha256.ts`, `/home/den/protofire/safe/safe-react-apps/apps/tx-builder/src/components/forms/fields/AddressInput.tsx`, `/home/den/protofire/safe/safe-react-apps/apps/tx-builder/src/components/forms/fields/styles.ts`, `/home/den/protofire/safe/safe-react-apps/apps/tx-builder/src/theme/lightPalette.ts`, `/home/den/protofire/safe/safe-react-apps/scripts/verify_safe_app_deployment.mjs`, `/home/den/protofire/safe/safe-react-apps/apps/tx-builder/TRON_DEPLOYMENT.md`