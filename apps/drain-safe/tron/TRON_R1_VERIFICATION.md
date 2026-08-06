# R1 walkthrough results — 2-asset drain on Shasta

**Date:** 2026-08-05 · **Verdict: R1 is NOT a blocker. The drain-safe port is not gated on it.**

Scripts: `scripts/probe*.py`, `scripts/sim2.py`, `scripts/sim3.py` — see `README.md` for how to run
them. They are read-only, need no keys, and broadcast nothing.

## What was executed

An `eth_call` of the exact transaction the host builds for a drain-safe 2-asset batch:
`Safe.execTransaction(to=MultiSendCallOnly, operation=1 /*delegatecall*/, data=multiSend(bytes))`
against the real Shasta Safe `0xD72c8d27d0F45173d3178E35B2d496F56a407fF7` (v1.4.1, threshold 1,
owner `0x61ca933f…`, holding 1 TRX). Signature uses the `v=1` approved-hash form with
`from=owner`, the standard no-key Safe simulation technique.

## Results

| # | Case | Outcome | Energy |
|---|---|---|---|
| A | 2-asset drain (1 TRX + TRC-20) | **PASS** (returns `true`) | 46,836 |
| B | native leg over-spend (2 TRX) | REVERT — proves TRX leg executes | — |
| C | token leg over-spend (1 USDT) | REVERT `SafeMath: subtraction overflow` **from inside the USDT contract** — proves TRC-20 leg executes and the address param decoded correctly | — |
| D | native only (1 tx) | PASS | 33,585 |
| E | drain to unactivated account | PASS | 74,961 (+28,125) |
| F | 5-asset batch | PASS | 90,991 |
| G | 20-asset batch | PASS | 315,847 |
| — | bad signer in signature | REVERT `GS025` — proves the sig/`from` path is enforced, so A is meaningful | — |

Energy fee is 100 sun/energy on **both** Shasta and mainnet → 20-asset batch ≈ 31.6 TRX,
far under the 15,000 TRX `getMaxFeeLimit`. TronLink's *default* fee_limit is still unverified.

## Address resolution (the actual R1 question)

The gateway's nine `null` `contractAddresses` are **never read by host production code** — every
occurrence is a test mock. The host resolves from a fork-added file:

`apps/web/tron-deployments.json:9` → `apps/web/src/hooks/coreSDK/safeCoreSDK.ts:104-129`
→ protocol-kit `contractNetworks` → `BaseContract.js:71` (`customContractAddress ??` short-circuits
safe-deployments entirely) → `ReviewSafeAppsTx.tsx:33` `createMultiSendCallOnlyTx`.

Because that resolution happens inside `Safe.init()`, **a working single-tx Safe App flow is itself
proof the batch address resolves** — if it failed, the whole SDK would be unavailable.

### Verified deployments (non-canonical; canonical addresses are NOT deployed on Tron)

| Contract | Shasta 2494104990 | Mainnet 728126428 |
|---|---|---|
| MultiSendCallOnly | `0xf1dd46Af04774C999e213FA6dF2b4278BBa8A757` (392 B) | `0x6A8824d50B7AeEc29A6eC61ce928d964331AB35f` (392 B) |
| MultiSend | `0x5b84368e2fDe91C994434A4acBd29A0E1d60a1eA` (559 B) | `0x92F65C8F5eeB25617Acf7F3626936B5AB0C63680` (559 B) |
| SafeL2 1.4.1 | `0x2e6355a073170c38b778af539b8f11e207ca4e30` | `0xddBB124aA9f02C1234026E4f9AB106169FAaf15e` |

All discovered independently by enumerating the 21 contract creations of deployer
`41495369e87dd860a5546bd0d6c276691f61e9a4cb` (`probe3.py`) — two full deployment batches exist;
batch 1 is the live set (the test Safe's proxy factory `0x1cd2a7aa…` is from batch 1).
These match `safe-decoder-service/app/config.py:57 SAFE_DEPLOYMENTS_OVERRIDES` exactly.
Note that decoder-service override is for **display/ABI decoding**, not tx construction.

**Mainnet contract layer is fully deployed** (identical bytecode sizes). Only the gateway entry is
missing: `GET /v1/chains` returns `count: 1`, Shasta only.

## Plan amendments

- **R1 → resolved.** Drop "escalate to safe-config-service for the null config" as a *blocker*; the
  wallet path doesn't consult it. Sequencing is unblocked — no need to defer commits.
- **R6 → resolved empirically.** Standard `web3-eth-abi` encoding (no `0x41` inside params) is
  correct on TVM. Control C is the proof. `sdk-helpers.ts` and its golden vectors stay untouched.
- **R2 → largely resolved.** Costs measured; unactivated-recipient surcharge confirmed at +28,125
  energy (matches the documented +25,000 note). Residual: TronLink's default fee_limit.

## Still genuinely unverified (needs keys / a human with TronLink)

1. **A signed, mined broadcast.** `eth_call` executes the full bytecode path but does not test
   TronLink's fee_limit default, bandwidth, or the host's review screen.
2. **A nonzero TRC-20 transfer.** The Safe holds 0 USDT, so the token leg ran with amount 0.
   Control C proves the call path and decoding are correct, but no tokens actually moved.
   To close: fund the Safe with any Shasta TRC-20 and re-run `sim3.py` with a nonzero amount.
3. **R4 host behaviour** — what the review screen renders for `to` (hex or base58).

## New findings worth acting on (host-side, outside drain-safe)

- `apps/mobile/src/hooks/coreSDK/safeCoreSDK.ts:57` has **no Tron override** → mobile fails on Tron.
- `yarn dev` does not run `prebuild-deployments.cjs`, so Tenderly simulation
  (`tenderly/utils.ts:67`) and the ExecuteBatch flow (`useMultiSendContract.ts:12`) — which read
  safe-deployments directly rather than `contractNetworks` — have no address locally.
- `safeCoreSDK.ts:112` hardcodes the JSON key `['1.4.1']`; a Safe on any other version silently
  skips the override and breaks `Safe.init` wholesale.
- `isTronChain` accepts Nile `3448148188` but `tron-deployments.json` has no entry for it.
