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
| `GET /v1/chains/2494104990/contracts/0x00…00` | **503** — unchanged; ABI auto-lookup via the gateway is still blocked (Gap 5) |
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

- `getAbiFromGateway` (`src/lib/getAbi.ts:49`) → 404, always;
- `getABIFromScanAPI` (`:70`) → its chain-info fetch (`:74`) 404s before it can
  even read `blockExplorerUriTemplate`, always;
- `getAbiFromSourcify` (`:33`) → no Tron index, always.

**Consequence:** ABI auto-lookup in the currently-registered app cannot work,
and **fixing Gap 5 will not fix it** — the requests never reach the Tron
gateway. That app needs a rebuild against the correct gateway; §2–§5 produce it.
Batch composition and submission in that app are unaffected (they never touch
the gateway), so it is degraded, not broken.

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

### Read this before you start: "To Address" needs the hex address, pasted directly

The top **"Enter Address"** box is a *contract-lookup* field for ABI search. It
is **decoupled** from the transaction's **"To Address"** field. Typing a Tron
base58 (`T…`) address into the lookup box does **not** populate or convert
"To Address" — that field simply stays empty and marked *"Required"*, with **no
toast and no inline error text**.

That is the hex-only design of this deployment's bridge working as intended, not
a broken field. Confirmed hands-on 2026-08-03; it cost real diagnosis time.

**Always paste the contract's `0x…` hex address directly into "To Address",**
independent of whatever is in the lookup box above it. Convert base58 → hex with
`'0x' + TronWeb.address.toHex(base58).slice(2)` (drop the `41` prefix).

### Steps

1. **Load.** Safe{Wallet} Tron → select a Shasta Safe → **Apps → My custom apps**
   (route `/apps/custom`; the add button is on that page, not on `/apps`) →
   **Add custom Safe App** → paste the app URL → tick the risk acknowledgement →
   **Add**. Record: does the dialog preview the name and icon?
2. **Handshake.** Open the app. It should render the dashboard and show the
   Safe's address/network — that confirms `getSafeInfo` + `getChainInfo` over the
   bridge.
3. **Base58 rejection, lookup box (user story 9).** Paste a `T…` address into
   **"Enter Address"**. **Pass condition:** the app does not crash, and "To
   Address" stays empty and marked *"Required"* with no explicit error text.
   This is expected behavior — do not file it as a bug.
3b. **Base58 rejection, argument field (user story 9, the other half).** Select
   a method with an `address` parameter — `withdraw(address,uint256)` on the
   testbed contract — and type a `T…` address into that parameter field.
   **Pass condition:** an **"Invalid address"** message appears under the field
   and the form stays usable. Before the fix in §7a this threw an uncaught
   exception; if you see a blank or frozen form here, the deployed bundle
   predates that fix.
4. **Single call.** Paste the contract's **hex** address into "To Address",
   paste the ABI into the manual-ABI field, select `increment()`, review the
   encoded calldata, add to batch.
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
10. **ABI auto-lookup.** Enter a contract address with *no* manual ABI. Expected
    today: no ABI is found (gateway `/contracts` → 503) and the manual-paste
    field remains usable. Re-test after Gap 5 is fixed.

Record the outcome of each step with the date and the app URL tested. This
walkthrough doubles as the reference proof that the deployment's whole Safe Apps
stack works end to end.

---

## 7. ABI resolution: what works, what lights up later

`getAbi()` (`src/lib/getAbi.ts:155-167`) races three providers via
`Promise.any`. On this deployment:

| Provider | Status | Notes |
|---|---|---|
| Sourcify (`:33`) | **Never works** | `https://sourcify.dev/server/files/{chain}/{address}` — no Tron index. Harmless no-op failure. |
| Gateway `/contracts` (`:49`) | **Blocked, fixes itself** | The strategic path. Returns 503 today (Gap 5, a separate backend issue). Once fixed, it works with **no code change** — provided the bundle was built against the Tron gateway (§1). |
| Explorer scan API (`:70`) | **Deferred** | Expects an Etherscan-V2-, Blockscout- or Subscan-shaped response. Tronscan's contract API matches none of them, so this needs a new adapter branch. Out of scope. |

**Manual ABI paste is the supported operator flow at launch** and works today:
`useAbi` exposes `setAbi` straight to the form, and `abiStatus` resolves to
`SUCCESS` even when lookup returns nothing, so the paste field stays usable.

**No simulation.** `isSimulationSupported()`
(`src/lib/simulation/simulation.ts:18-21`) is hardcoded `return false` — the real
feature-flag check is commented out. So the "Simulate" button
(`src/pages/ReviewAndConfirm.tsx:118-120`) never renders, and Tenderly is never
called. Shasta's chain config does not ship `TX_SIMULATION` either. Leave it off;
do not attempt a Tron substitute.

---

## 7a. Source fix: address fields must not throw on a base58 address

This is the **only application-logic change** on this branch, and it was not
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

Covered by `src/components/forms/validations/validateField.test.ts` (11 tests),
including the base58 cases for `address`, `address[]` and `address[][]`.

**This is not base58 support** and does not move that into scope. A `T…` address
is still rejected; it is now rejected with a message instead of an exception.

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
