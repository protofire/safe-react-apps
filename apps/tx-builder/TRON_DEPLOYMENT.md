# Transaction Builder on Safe{Wallet} Tron — build, deploy, verify, register

Runbook for shipping this workspace's Transaction Builder as a Safe App on the
Safe{Wallet} Tron staging deployment.

| | |
|---|---|
| **Source branch** | `feat/tx-builder-tron-shasta`, cut from `protofire-stg` @ `25c1d870718ed0f8f893ce820c5fffac4d4b0d62` |
| **App version** | `tx-builder` 1.19.0 |
| **Safe UI (embedding origin)** | `https://tron-app.stage.safe.protofire.io` |
| **Client gateway** | `https://gateway-tron.stage.safe.protofire.io` |
| **Chain** | Tron Shasta Testnet, `2494104990` — the only chain this gateway serves |
| **Build config** | [`.env.tron.shasta`](./.env.tron.shasta) |
| **Verifier** | [`scripts/verify_safe_app_deployment.mjs`](../../scripts/verify_safe_app_deployment.mjs) |

No application logic is changed for Tron. The only build-time difference from a
stock build is `REACT_APP_GATEWAY_BASE_URL`.

---

## 1. Deployment state, probed 2026-08-03

Re-probe these before acting on this document; all four moved between the
research rounds and this one.

| Probe | Result 2026-08-03 |
|---|---|
| `GET /v1/chains` | `count: 1` — Tron Shasta Testnet only. Mainnet still absent. |
| `GET /v1/chains/2494104990/safe-apps` | **1 app registered** (was `[]` in Rounds 1–2) |
| `GET /v1/chains/2494104990/contracts/0x00…00` | **503** — unchanged; the *gateway's* ABI lookup is still blocked (Gap 5). No longer blocks the feature: ABI auto-lookup now goes through the Tron node (§7c) |
| `GET gateway-registry.safe.protofire.io/v1/chains/2494104990` | **404** — that gateway serves 136 chains, none of them Tron |

### A Transaction Builder is already registered — and it is misbuilt

`GET /v1/chains/2494104990/safe-apps` now returns one entry:

```json
{ "id": 1, "url": "https://dev-apps.safe.protofire.io/tx-builder",
  "name": "Transaction Builder", "chainIds": ["2494104990"],
  "features": ["BATCHED_TRANSACTIONS"], "tags": ["Infrastructure", "transaction-builder"] }
```

Its **hosting is compliant** — verified with the tool in §4:

```
PASS https / root / framing / manifest / manifest-cors / icon
FAIL gateway   bundle is built against https://gateway-registry.safe.protofire.io
               but https://gateway-tron.stage.safe.protofire.io was expected
```

The served bundle (`/tx-builder/static/js/main.8030a8ce.js`, `last-modified:
2026-06-30`) inlines
`REACT_APP_GATEWAY_BASE_URL:"https://gateway-registry.safe.protofire.io"`.
That host **404s for chain `2494104990`**, so in that deployment:

- `getAbiFromGateway` → 404, always;
- `getABIFromScanAPI` → its chain-info fetch 404s before it can even read
  `blockExplorerUriTemplate`, always;
- `getAbiFromSourcify` → no Tron index, always;
- `getAbiFromTronNode` (§7c) → absent from that bundle, and would 404 on the same
  chain-info fetch anyway.

**Consequence:** ABI auto-lookup in the currently-registered app cannot work, and
neither fixing Gap 5 nor the Tron-node path fixes it — the requests never reach
the Tron gateway. That app needs a rebuild against the correct gateway; §2–§5
produce it. Batch composition and submission in that app are unaffected (they
never touch the gateway), so it is degraded, not broken.

> Note the `manifest-cors` result above is a genuine PASS. The bucket serves
> `Access-Control-Allow-Origin: *` but only to requests that carry an `Origin`
> header (it sends `vary: Origin`). A HEAD request, or a GET without `Origin`,
> shows no CORS header at all and looks like a failure. The verifier sends
> `Origin`, as a browser does; ad-hoc `curl -I` checks do not.

---

## 2. Build

Requires Node ≥ 16 and yarn 1.x.

```bash
git checkout feat/tx-builder-tron-shasta      # or the commit you are pinning
yarn install --frozen-lockfile
yarn workspace tx-builder build:tron          # reads .env.tron.shasta
```

Output: `apps/tx-builder/build/`.

`build:tron` is `dotenv -e .env.tron.shasta -- react-app-rewired build`. It does
not read or write `.env`, so it cannot silently pick up a developer's local
config — which is exactly how a bundle ends up pointed at the wrong gateway.

### Environment variables

| Variable | Value | Why |
|---|---|---|
| `REACT_APP_GATEWAY_BASE_URL` | `https://gateway-tron.stage.safe.protofire.io` | **The only setting that matters.** Read at `src/lib/getAbi.ts:17`; used for the gateway ABI lookup (`:27`) and the scan-API path's chain-info fetch (`:74`). |
| `REACT_APP_TENDERLY_*` | *empty* | Simulation is hardcoded off — see §7. |
| `REACT_APP_*_API_KEY` | *empty* | Explorer scan-API ABI path cannot work on Tron — see §7. |
| `INFURA_KEY`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY` | *empty* | Only used by the hardhat test-contract tasks, never by the app build. |

### Serve it at `/tx-builder`, or set `PUBLIC_URL`

`package.json` declares `"homepage": "/tx-builder"`, so the built `index.html`
references its assets at absolute paths under `/tx-builder/…`. Hosting the
bundle at any other path yields a blank page with 404s on every asset. Either
serve it at `/tx-builder` (as the existing deployment does), or override:

```bash
PUBLIC_URL=/some/other/path yarn workspace tx-builder build:tron
```

---

## 2a. Running it locally

```bash
nvm use 18                                    # CI's pinned version
yarn install --frozen-lockfile
yarn workspace tx-builder start:tron          # reads .env.tron.shasta
```

Serves on **`http://localhost:3000/tx-builder`** — note the path. `homepage`
is `/tx-builder`, so the dev server mounts `public/` there too: the manifest is
at `/tx-builder/manifest.json`, and plain `http://localhost:3000/` returns the
history-fallback HTML for every asset path. Verifying the wrong URL produces a
confusing "manifest is not valid JSON: Unexpected token '<'".

**Use `start:tron`, not `start`.** `start` is `dotenv -e .env -- …` and `.env`
is gitignored and absent from a fresh clone. `dotenv-cli` does **not** error on
a missing file — it silently leaves every variable unset, so the app boots and
looks healthy while `getAbi.ts` builds `undefined/v1/chains/…` request URLs.
That is the same failure mode as the misbuilt deployment in §1, just locally.
Confirm with:

```bash
node scripts/verify_safe_app_deployment.mjs http://localhost:3000/tx-builder \
  --allow-http --expect-gateway https://gateway-tron.stage.safe.protofire.io
```

The dev server already sends `Access-Control-Allow-Origin: *`
(`config-overrides.js`, the `devServer` hook), so all seven checks pass locally.

### Loading it into the real Safe UI

The app is only meaningful inside the Safe iframe — standalone it has no SDK
peer, so it will sit waiting for a handshake that never arrives. Safe{Wallet} is
HTTPS and a browser will not frame `http://localhost`, so tunnel it:

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

Then add `https://<tunnel-host>/tx-builder` as a custom Safe App via
**Apps → My custom apps** and follow the §6 walkthrough. Re-run the verifier
against the tunnel URL first (without `--allow-http`) — tunnels sometimes inject
their own headers.

### Unit tests

```bash
yarn workspace tx-builder test --watchAll=false     # run on Node 18 (see below)
yarn test:deploy-verifier                           # the verifier's own 57 tests
```

**Use Node 18** — the version CI pins (`.github/workflows/lint.yml:12`). On Node
20+, 16 tests in `validations.test.ts` fail purely because they hard-code V8's
old `JSON.parse` error wording (`"Unexpected token I in JSON at position 2"` vs
the current `"Unexpected token 'I', ... is not valid JSON"`). That is
environment drift with no functional meaning.

Current state on Node 18: **604 passed, 1 failed, 3 skipped**.

The single remaining failure is **pre-existing on `protofire-stg` and unrelated
to Tron** — verified by re-running it with this branch's source changes stashed.
`validations.test.ts:660` (`tuple field type › validates a tuple[]`) expects a
malformed `tuple(...)[]` input to produce a `SyntaxError` message, but the fork
deliberately skips web3-eth-abi validation for exactly that type
(`basicSolidityValidation.ts:10-11`, *"skip validation from web3-eth-abi
library, since it has issues with encoding `tuple(...)[]`"*), so no error is
returned. A stale upstream test against an intentional fork bugfix. Left alone:
"fixing" it would mean reverting the fork's bugfix or rewriting an assertion
whose intended behavior is not ours to decide.

> The PRD assumed the suite passed unmodified and that any failure would be
> environmental. That was not the case — 16 of the failures were a real defect.
> See §7a.

---

## 3. Hosting requirements

Static bundle on a stable HTTPS origin. Requirements, each traced to host
source in `tron-safe-app-research/INTEGRATION_GUIDE.md`:

- **HTTPS, single stable origin.** The host validates
  `event.origin === new URL(app.url).origin` (`AppCommunicator.ts:37`).
- **`manifest.json` at the app root** with `name`, `description`, and `icons`
  or `iconPath` (`manifest.ts:80-88`). The committed
  [`public/manifest.json`](./public/manifest.json) already satisfies this.
- **CORS on `manifest.json`** — fetched cross-origin (`manifest.ts:58-78`).
  Without it, the add-custom-app dialog reports *"The app doesn't support Safe
  App functionality"* even though the manifest is valid.
- **Manifest responds in < 5 s** — the host aborts the fetch at 5000 ms
  (`manifest.ts:58,65-66`).
- **No `X-Frame-Options`.** **No `frame-ancestors`** that omits
  `https://tron-app.stage.safe.protofire.io`. A `https://*.safe.global`
  allowlist does *not* cover this host — Round 1 found 15 of 50 candidate apps
  unframable for exactly that reason.
- All assets same-origin; no third-party-cookie dependence.

The repo's existing `scripts/deploy_to_s3_bucket.sh` (S3 + CloudFront) already
produces a compliant surface — the live deployment passes every hosting check.

---

## 4. Post-deploy verification (automated)

```bash
node scripts/verify_safe_app_deployment.mjs https://your.app/tx-builder \
  --expect-gateway https://gateway-tron.stage.safe.protofire.io
```

Exit code 0 = all checks passed, 1 = at least one failed, so this is safe to
gate CI or a deploy step on. Checks: `https`, `root`, `framing`, `manifest`,
`manifest-cors`, `icon`, `gateway`. Add `--json` for machine-readable output and
`--origin` to test against a different embedding origin.

The `gateway` check exists because of §1: a bundle compiled against the wrong
gateway passes every manifest, CORS and framing probe while being unable to
resolve a single ABI. It is the only check that inspects build-time config, and
it is the one that would have caught the currently-registered app.

Verify a build **before** uploading it:

```bash
yarn workspace tx-builder build:tron
npx serve -s apps/tx-builder/build -l 8765     # or any static server
node scripts/verify_safe_app_deployment.mjs http://127.0.0.1:8765 \
  --expect-gateway https://gateway-tron.stage.safe.protofire.io --allow-http
```

The verifier's own suite (57 tests, zero new dependencies, no network):

```bash
yarn test:deploy-verifier      # node --test scripts/verify_safe_app_deployment.test.mjs
```

The `gateway` check works against both a production build (minified, bare key)
and the dev server (unminified, quoted key), so it is usable at every stage.

### Cypress e2e

`cypress/e2e/tx-builder/tx-builder.spec.cy.js` exists but is **not usable as-is
here**: it drives a full Safe{Wallet} web app (`CYPRESS_WEB_BASE_URL`,
`CYPRESS_TESTING_SAFE_ADDRESS`, `CYPRESS_CHAIN_ID`, …) rather than the app alone,
and it selects the lookup field by `/enter address or ens name/i` — a label this
fork changed to `"Enter Address"` (`Dashboard.tsx:136`). Another stale test
against a deliberate fork change. Adapting it for Tron is out of scope; the §6
manual walkthrough is the acceptance test.

---

## 5. Registration entry (ops hand-off)

Registering is a gateway config change, performed by the Safe{Wallet} Tron
operators — not by this work. Hand them:

| Field | Value |
|---|---|
| `url` | the verified origin, e.g. `https://dev-apps.safe.protofire.io/tx-builder` (no trailing slash, no query params — the host strips both, `manifest.ts:58-62,95-96`) |
| `name` | `Transaction Builder` |
| `description` | `Compose custom contract interactions and batch them into a single transaction` |
| `iconUrl` | 256×256 PNG — [`public/tx-builder.png`](./public/tx-builder.png) |
| `chainIds` | `["2494104990"]` |
| `tags` | `["Infrastructure", "transaction-builder"]` |
| `features` | `["BATCHED_TRANSACTIONS"]` |
| `accessControl` | `NO_RESTRICTIONS` |

This matches the shape of the existing `id: 1` entry, so the likely action is
**updating that entry's URL** to a correctly-built bundle rather than adding a
second one. Note the registered `description` differs from the app's own
manifest (`"A Safe app to compose custom transactions"`); the gateway value is
what users see for a registered app, and the manifest value is what the
add-custom-app dialog previews. Aligning them is optional.

---

## 6. Validation walkthrough (manual — needs a human with TronLink)

This is the acceptance test. Prerequisites: a Shasta Safe with the tester as
owner, TronLink on Shasta with TRX, and a deployed contract plus its ABI —
`tron-safe-app-research/examples/testbed-contract` (`TxBuilderTestbed`) exists
for this and covers the whole matrix (`increment()`, `setValue(uint256)`,
`setValueAndLabel(uint256,string)`, `deposit()` payable).

### Read this before you start: base58 on screen, hex on the wire

On Tron the app shows addresses in base58 (`T…`) **everywhere a human sees one** —
the "Enter Address" and "To Address" fields, `address` method arguments, the batch
list, transaction details and explorer links — with no `trx-shasta:` prefix,
because a base58 address is not an EIP-3770 address.

Underneath, every address is stored and submitted as `0x…` hex, because the
bridge, the transaction service, the gateway and the ABI encoder are hex-only
(§7b, §7b-2). Paste either form into any field: hex is converted to base58 for
display, base58 is converted to hex for use.

An incomplete or mistyped base58 address (base58check catches single-character
typos) is left as typed and reported as *"Invalid address"*.

The top **"Enter Address"** box is still a *contract-lookup* field for ABI
search, **decoupled** from the transaction's **"To Address"** field: filling it
does not populate "To Address" (which stays empty and marked *"Required"*). That
is upstream behaviour, not a Tron issue — fill both.

### Steps

1. **Load.** Safe{Wallet} Tron → select a Shasta Safe → **Apps → My custom apps**
   (route `/apps/custom`; the add button is on that page, not on `/apps`) →
   **Add custom Safe App** → paste the app URL → tick the risk acknowledgement →
   **Add**. Record: does the dialog preview the name and icon?
2. **Handshake.** Open the app. It should render the dashboard and show the
   Safe's address/network — that confirms `getSafeInfo` + `getChainInfo` over the
   bridge.
3. **Base58 input, lookup box (user story 9).** Paste the contract's `T…`
   address into **"Enter Address"**. **Pass condition:** the field keeps showing
   the `T…` address, with no `trx-shasta:` prefix and no flip to `0x…`, and its
   ABI is fetched automatically (see step 10) — no manual paste needed. Paste the
   `0x…` form instead and the field should display the `T…` equivalent.
3b. **Base58 input, argument field (user story 9, the other half).** Select a
   method with an `address` parameter — `withdraw(address,uint256)` on the
   testbed contract — and type a `T…` address into that parameter field.
   **Pass condition:** it stays as typed and the encoded calldata carries those
   20 bytes. Then change its last character: **"Invalid address"** appears and
   the form stays usable. Before the fixes in §7a/§7b this field threw an
   uncaught exception; a blank or frozen form here means the deployed bundle
   predates them.
4. **Single call.** Put the contract's address (base58 or hex) into "To Address",
   select `increment()`, review the encoded calldata, add to batch. The ABI
   should already be populated from step 3; if you are testing the manual path,
   clear it and paste the ABI JSON instead.
4b. **Base58 display (§7b-2).** Expand the batch entry you just added.
   **Pass condition:** the destination and any `address` argument are shown in
   base58 with no `trx-shasta:` prefix, `data:` is still raw hex, and the copy
   button yields a `T…` address. On a proxy contract, the implementation dialog's
   explorer button must open a Tronscan page that actually resolves.
5. **Batch (≥ 2 calls).** Add `setValue(uint256)` with some value. Reorder the
   two entries, delete one, re-add it — confirms user story 6.
6. **Payable call.** Add `deposit()` with a TRX value. `value` is decimal SUN,
   6 decimals: `1000000` = 1 TRX.
7. **Submit.** Send the batch. Confirm the Safe transaction that appears is
   **MultiSend-wrapped** (the host wraps `txs.length > 1` in
   MultiSendCallOnly — `ReviewSafeAppsTx.tsx:31-32`; those contracts are
   deployed on Shasta).
8. **Co-sign and execute** on Shasta via TronLink. Verify the resulting state
   change on Tronscan.
9. **Batch library.** Save the batch, reload the app, re-load the saved batch
   (user story 10).
10. **ABI auto-lookup.** Enter a contract address with *no* manual ABI.
    **Pass condition:** the ABI appears in the "Enter ABI" field within a couple
    of seconds and the method selector fills up — it comes from the Tron node's
    on-chain ABI (§7), not from the gateway or an explorer, so it works for
    unverified contracts too. A contract deployed without an on-chain ABI shows
    *"No ABI found for this address"* and the manual-paste field stays usable.

Record the outcome of each step with the date and the app URL tested. This
walkthrough doubles as the reference proof that the deployment's whole Safe Apps
stack works end to end.

---

## 7. ABI resolution: what works, what lights up later

`getAbi()` races its providers via `Promise.any`. On this deployment:

| Provider | Status | Notes |
|---|---|---|
| **Tron node `wallet/getcontract`** | **Works — this is the Tron path** | Added on this branch (§7c). Tron stores each contract's ABI *on chain*, so the node answers for **unverified** contracts too. Endpoint derived from the chain config's own `safeAppsRpcUri` (`https://api.shasta.trongrid.io/jsonrpc` → `…/wallet/getcontract`), CORS `*`, ~1.5 s round trip including the chain-info fetch. |
| Sourcify | **Never works** | `https://sourcify.dev/server/files/{chain}/{address}` — no Tron index. Harmless no-op failure. |
| Gateway `/contracts` | **Blocked (Gap 5)** | Returns 503 today; `422` for a base58 address, i.e. it wants hex. No longer on the critical path — if it starts working it just wins the race sometimes. |
| Explorer scan API | **Cannot work on Tron** | Expects an Etherscan-V2-, Blockscout- or Subscan-shaped response; Tronscan's contract API matches none of them. Worse, the API host the chain config advertises (`https://shasta.tronscan.org/api`) is Cloudflare-gated — the reachable host is `https://shastapi.tronscan.org/api`. Its only advantage over the node path is verified *source*, which this app does not use. Out of scope. |

**Manual ABI paste still works and remains the fallback:** `useAbi` exposes
`setAbi` straight to the form, and `abiStatus` resolves to `SUCCESS` even when
lookup returns nothing, so the paste field stays usable.

**No simulation.** `isSimulationSupported()`
(`src/lib/simulation/simulation.ts:18-21`) is hardcoded `return false` — the real
feature-flag check is commented out. So the "Simulate" button
(`src/pages/ReviewAndConfirm.tsx:118-120`) never renders, and Tenderly is never
called. Shasta's chain config does not ship `TX_SIMULATION` either. Leave it off;
do not attempt a Tron substitute.

---

## 7a. Source fix: address fields must not throw on a base58 address

The first of three application-logic changes on this branch, none of them
anticipated by the PRD. Two sites called `web3-utils`' `toChecksumAddress`
unconditionally on address input:

- `src/components/forms/validations/validateField.ts:33`
- `src/utils.ts:163` (`parseInputValue`)

`toChecksumAddress` **throws** on anything that is not a 40-hex-char address.
So any invalid address in an address-typed field raised an uncaught exception
instead of producing a validation message — including a **Tron base58 `T…`
address**, and including every intermediate keystroke of a half-typed address.

That is user story 9's "clear, non-crashing error" bar failing in the place
operators will actually hit it. The PRD's hands-on session only exercised the
top **"Enter Address"** lookup box (which is fine — see §6); address-typed
*method-argument* fields go through the code above and were never tested.

Both sites now normalise only when the value is address-shaped and pass anything
else through, so the existing validators report it:

```ts
isValidAddress(value) ? toChecksumAddress(value) : value
```

This restores the upstream contract, which the fork's own test suite already
specified and which 16 tests were failing on:

- `validateField('address')('INVALID ADDRESS VALUE')` → `'Invalid address'`
- `parseInputValue('address', 'INVALID_ADDRESS')` → `'INVALID_ADDRESS'` unchanged
  (`utils.test.ts:172-176`), letting the ABI encoder emit its own
  `format error. details: invalid address` for array and matrix element values

Checksum leniency — the reason the fork added the call — is preserved: lowercase,
mixed-case and correctly-checksummed addresses all still validate and encode.

Covered by `src/components/forms/validations/validateField.test.ts`, including the
base58 cases for `address`, `address[]` and `address[][]`.

This fix only stopped the crash — a `T…` address was still *rejected*. §7b makes
it work.

---

## 7b. Source change: Tron base58 addresses are accepted and converted

Rejecting `T…` addresses was never going to hold: base58 is the only address form
Tronscan, TronLink and every Tron doc shows, so operators paste it, and telling
them to hand-convert with TronWeb was the wrong bar for a Safe App.

A base58 address is the *same address* as its hex form. base58check decodes to 21
bytes — a `0x41` network prefix plus the 20 bytes the hex form shows — and the
trailing 4 bytes are a double-SHA-256 checksum, which is what makes a
single-character typo detectable.

**Implementation** — one conversion, applied at every boundary where a
user-supplied address enters the app:

- `src/utils/tronAddress.ts` — base58check codec.
  `normalizeTronAddress(value)` converts a complete, checksum-valid `T…` address
  to `0x…` and returns anything else untouched, so each call site keeps reporting
  its own errors for junk and half-typed input. Also exports `hexToTronBase58`
  (display, Tron-native APIs) and `hexToTronRawHex` (the `41…` form).
- `src/utils/sha256.ts` — SHA-256 (FIPS 180-4). No runtime dependency of this app
  provides it (`web3-utils` is keccak-only), and the checksum needs it; 100 lines
  beat a new bundle dependency. Verified against the NIST vectors.

Call sites: the address field itself
(`AddressInput.tsx` → `checksumValidAddress`, which covers **all** address inputs
including "To Address" and method arguments), `parseInputValue`
(`utils.ts`, covers `address`, `address[]`, `address[][]`), `validateField.ts`,
`SolidityForm.tsx` (`parseFormToProposedTransaction`, for batches imported from a
file), `AddNewTransactionForm.tsx` and `Dashboard.tsx`'s lookup box — which was
the *last* unguarded `toChecksumAddress` call, and therefore still crashed on a
pasted `T…` address after §7a.

**Conversion happens on input, not on submit.** The field rewrites `T…` to `0x…`
as you paste, so what you see is what gets submitted, and one representation
flows through encoding, review, the batch file and the transaction service.
No `T…` string reaches anything downstream.

Covered by `src/utils/tronAddress.test.ts`, `src/utils/sha256.test.ts` and the
base58 cases in `validateField.test.ts` / `utils.test.ts` — including the typo
case (last character changed → `"Invalid address"`, *not* a silently wrong
address).

---

## 7b-2. Presentation: hex is canonical, base58 is what a human sees

The gateway settles the question of which form is canonical — it is hex, all the
way down. `GET /v1/chains/2494104990/safes/0xD72c8d27d0F45173d3178E35B2d496F56a407fF7`
returns hex for the Safe, every owner, the implementation and the fallback
handler. So the app **stores, encodes and submits hex**, and treats base58 purely
as a rendering.

Tronscan, however, resolves base58 **only** — verified 2026-08-04 against
`shastapi.tronscan.org/api/account`:

| Address form | Result |
|---|---|
| `TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ` | 200, account data |
| `41b8f88c79…` (raw Tron hex) | `some parameters are invalid or out of range` |
| `0xb8f88c79…` | `some parameters are invalid or out of range` |

That made every explorer link built from `blockExplorerUriTemplate.address` a
dead link on Tron.

**What changed** — `toDisplayAddress(address, networkPrefix)` /
`toDisplayAddressList` in `src/utils/tronAddress.ts` convert hex to base58 when
the chain's short name is Tron's (`isTronNetworkPrefix`: `trx`, `trx-*`), and
return the address untouched on every other chain, so non-Tron builds of this
source are unaffected. Applied to:

- `AddressInput.tsx` — **every address field**, via `toInputValue`: the field
  renders the base58 form of the hex it holds. See below; this is the one place
  where display and state genuinely diverge.
- `AddressContractField.tsx` — **and it is not enough to fix `AddressInput`.**
  This wrapper (used for "To Address" and for `address` method arguments, via
  `Field.tsx`) passes `inputProps={{ value }}`, which makes that input
  *controlled*: React re-asserts the raw form state on every render and overrides
  the base58 value `AddressInput` writes into its ref. That is why "To Address"
  kept showing `0x958ACEc5…` while the uncontrolled lookup box above it already
  showed `TPbuyAoBUEzGQbn…` — the same address, rendered two ways. The wrapper now
  converts the controlled value too, and still adds no network prefix.
- `TransactionDetails.tsx` — the "Interact with:" heading, the `to (address)` row
  and **address-typed method arguments** (`address`, `address[]`, `address[][]`,
  `address[N]` — the list variant rewrites each address inside the value).
  The `data:` row stays raw calldata hex.
- `TransactionBatchListItem.tsx` — the destination label in the batch list.
- `ImplementationABIDialog.tsx` and the Tronscan link `Dashboard.tsx` builds
  for it.

Two details worth knowing:

- **No EIP-3770 prefix on Tron.** A base58 address is not a `shortName:0x…`
  address, so `shouldShowShortName` is off on Tron chains — you see
  `TSqF5pn9…`, not `trx-shasta:TSqF5pn9…`. The copy button copies the base58
  form, which is what Tronscan and TronLink accept.
- **Identicons stay seeded by hex.** `EthHashInfo` gained an `avatarSeed` prop:
  the blockie is generated from the canonical hex address so one address looks
  the same here as everywhere else in Safe{Wallet}.

### Input fields: hex in state, base58 in the box

Input fields were initially left showing hex, on the reasoning that a field should
show what it submits. In practice that reads as the app rejecting Tron's address
format — you paste `T…`, it turns into `trx-shasta:0x…` — so the fields now show
base58 too, while the form state stays hex.

`AddressInput` is an uncontrolled input synced to `address` through a ref, and two
of its effects reconcile the two. Both compared the field's text against the state
string directly, which on Tron differ *by design*, so both needed a Tron branch:

- The "address changed from outside" effect (QR scan, proxy-ABI dialog) compares
  the field against `toInputValue(address, …)` — what it *should* be showing —
  rather than against the raw state. Comparing raw would treat every render as a
  new address and rewrite the field mid-typing.
- The network-switch effect skips pushing state when the field is already showing
  the address in state; otherwise it would re-push the same hex on every render
  and mark a pristine field dirty.

Both branches are gated on `isTron`, so behaviour on every other chain is
byte-identical — including the checksum-on-type and EIP-3770 prefix handling.

Conversion into hex still happens the moment a complete base58 address is
recognised (`checksumValidAddress` → `normalizeTronAddress`), so `onChangeAddress`
never emits base58 and no consumer of form state sees a `T…` string. Incomplete or
mistyped input is left exactly as typed and reported as *"Invalid address"*.

Covered by `src/components/forms/fields/AddressInput.test.tsx` — base58 in and
out, hex paste displayed as base58, half-typed input untouched, and the non-Tron
chain still prefixing and checksumming hex. Its harness holds the address state
the way the real parents do; with a stub `onChangeAddress` the sync effects never
run and the test proves nothing. Display elsewhere is covered by
`src/components/TransactionDetails.test.tsx` plus the helper tests in
`src/utils/tronAddress.test.ts`.

---

## 7c. Source change: ABI auto-lookup via the Tron node

Tron stores a contract's ABI on chain, so the node itself is an ABI source and
verification is irrelevant. `POST {node}/wallet/getcontract` with
`{"value": "41<40 hex>"}` returns `abi.entrys` for any contract deployed with its
ABI — including unverified ones, which is the whole ballgame on a testnet.

- `src/lib/getAbi.ts` — `getAbiFromTronNode` joins the `Promise.any` race. It
  reads the chain config from the gateway (the same fetch the scan-API path
  already did, now shared as `getChainInfoFromGateway`), bails unless the chain is
  Tron (`nativeCurrency.symbol === 'TRX'` or `shortName` starts with `trx`), and
  derives the REST host by stripping `/jsonrpc` from the advertised
  `safeAppsRpcUri`. No new environment variable: the gateway already publishes
  the endpoint.
- `src/lib/tronAbi.ts` — `tronAbiEntrysToAbi` converts Tron's ABI shape to
  standard ABI JSON. Three differences matter: `type`/`stateMutability` are
  capitalised (`"Function"`, `"Nonpayable"`) and `interfaceRepository.getMethods`
  compares them lowercase — without this, **`view` methods would be listed as
  writable**; empty `inputs`/`outputs` are omitted where array values are
  expected; and the legacy `payable`/`constant` flags are absent.

Verified end to end against Shasta on 2026-08-03: `getAbi()` resolved the testbed
contract `TSqF5pn9FxP77jfQCy46NoFa5HXdQaYiwZ` in ~1.5 s, and
`tronAbi.test.ts` asserts the app's own `getMethods` reads the converted ABI back
as the expected writable methods (`deposit` payable, `increment`, `withdraw`).

---

**Batching is the host's job.** `submitTransactions()`
(`src/store/transactionsContext.tsx:50-56`) sends a plain `{to, value, data}[]`
via `sdk.txs.send`. The app's own MultiSend encoder
(`src/lib/simulation/multisend.ts`) is reachable only from the simulation path,
i.e. dead code — so `@safe-global/safe-deployments` not knowing chain
`2494104990` is irrelevant. Do not wire it up.

---

## 8. Divergence from the copy vendored in `tron-wallet-monorepo`

Two different Transaction Builders exist. Compared against
`protofire/tron-wallet-monorepo@eb90af8`'s `apps/tx-builder`:

| | this branch (1.19.0) | vendored copy (2.0.0) |
|---|---|---|
| Gateway for ABI lookup | `REACT_APP_GATEWAY_BASE_URL` env var (`getAbi.ts:17,27`) | **hardcoded** `https://safe-client.safe.global` (`getAbi.ts:34`) — not configurable at all |
| Address validation | lenient `/^(0x)?[0-9a-fA-F]{40}$/` (`utils.ts:217-223`) | strict, checksum-sensitive `isAddress()` (`utils.ts:205-210`) |
| Lookup field label | `"Enter Address"` (`Dashboard.tsx:136`) | `"Enter Address or ENS Name"` (`Dashboard.tsx:121`) |
| Simulation | hardcoded off (`simulation.ts:18-21`) | reads the real `TX_SIMULATION` chain feature (`simulation.ts:17-20`) — off on Shasta anyway, via the flag |
| Scan-API ABI fallback | present | absent |

**The vendored copy is *newer* upstream code (2.0.0 vs 1.19.0), not a stale
snapshot** — the two lines have diverged in both directions. On the axes that
matter for Tron it is strictly worse: its gateway URL cannot be configured, so
it can never resolve an ABI on this deployment no matter what is fixed
server-side.

**Deploy this branch's version, not the vendored one.** Reconciling the two is a
team decision and is out of scope here, but note it is not a simple
delete-one-copy job: it means porting this fork's Tron-friendly adaptations
forward onto the 2.0.0 line, or back-porting 2.0.0's upstream improvements here.

---

## 9. Corrections to prior research

- `SAFE_REACT_APPS_ASSESSMENT.md` (§ tx-builder) states `protofire-stg`
  "removed the *Simulate batch* button and simulation-status UI from
  `src/pages/ReviewAndConfirm.tsx`". **It did not.** That code is still present
  (`ReviewAndConfirm.tsx:44-59,118-187`); it is gated on `simulationSupported`,
  which resolves from the hardcoded-`false` `isSimulationSupported()`. The
  operational conclusion is unchanged — the button never renders and there is no
  dead-clickable UI — but the mechanism is a runtime flag, not a code removal.
- The same doc describes the vendored copy as "UNMODIFIED upstream". It is
  version **2.0.0**, a newer upstream line than this branch — see §8.
- `PRD_TX_BUILDER.md`'s problem statement ("zero Safe Apps registered") was true
  when written and is **no longer true** — see §1.
- `PRD_TX_BUILDER.md`'s testing decisions state that "the app's existing unit-test
  suite (CRA/jest) must pass unmodified — we are not changing logic, so a failing
  suite indicates an environment problem, not a feature problem." **The premise
  was wrong.** The suite did not pass on the fork's own target Node version, and
  16 of the failures were a genuine defect affecting user story 9, not
  environment drift — see §7a. One further failure is a stale test against a
  deliberate fork bugfix (§2).
- `PRD_TX_BUILDER.md` decided that "no source patch is required for the core
  flow." True for the core compose/batch/submit flow, which is untouched. Not
  true for user story 9's non-crashing bar — §7a is a deliberate, minimal
  deviation from that decision.
- The research repo's `tools/check_safe_app_manifest.sh` does not check CORS at
  all, and always exits 0. Ad-hoc `curl -I` checks are actively misleading here:
  S3/CloudFront answers CORS only to requests carrying an `Origin` header, so a
  HEAD request shows no `Access-Control-Allow-Origin` on a bucket that serves it
  correctly. Use the verifier in §4.

---

## 10. Out of scope

- Fixing the gateway `/contracts` 503 (Gap 5) — separate backend/ops issue.
- A Tronscan adapter for the scan-API ABI path.
- Performing the gateway registration (ops does this with §5).
- Reconciling or removing the vendored `apps/tx-builder` in
  `tron-wallet-monorepo` — flagged in §8.
- Base58 address support in the app, re-enabling simulation, any change to the
  Safe UI / bridge / gateway, mainnet or Nile deployment, and any other Safe App.
