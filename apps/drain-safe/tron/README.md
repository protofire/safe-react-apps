# drain-safe on Tron — investigation output

Everything here is **documentation and throwaway probe scripts**. Nothing in this folder is
imported by the app or run by CI.

| File | What it is |
|---|---|
| `TRON_PORT_PLAN.md` | The implementation plan: gap analysis, file-by-file changes, address-conversion boundaries, risks. Start here. |
| `TRON_R1_VERIFICATION.md` | Evidence that a 2-asset drain actually executes on Shasta, and that MultiSendCallOnly resolves despite the gateway's null config. |
| `scripts/*.py` | Reproducible read-only probes against Shasta/mainnet. Python 3, stdlib only, no keys, no signing. |

## Re-running the probes

```bash
cd apps/drain-safe/tron/scripts
python3 probe.py    # is MultiSend / MultiSendCallOnly / the singleton deployed?
python3 probe3.py   # enumerate every contract the Safe deployer created on Shasta
python3 probe4.py   # the test Safe: masterCopy, version, owners, threshold, TRX balance
python3 sim2.py     # simulate the 2-asset drain (eth_call, returns true)
python3 sim3.py     # positive + negative controls, batch-size energy costs
```

`sim2.py` / `sim3.py` use `eth_call` with the Safe `v=1` approved-hash signature form and
`from=<owner>`, so they execute the full contract path **without any private key and without
broadcasting anything**. They are safe to run repeatedly and change no on-chain state.

## What was actually implemented (differs from the plan's §4.2)

`TRON_PORT_PLAN.md` §4.2 proposed **vendoring** tx-builder's `AddressInput` fork, which forced a
rewrite of its stylesheet against a different theme. That turned out to be unnecessary.

Reading the library component's source (recovered from `index.min.js.map`) shows it is
**uncontrolled**: it holds the field text in a ref and only overwrites it when the `address` prop
stops matching what is displayed. So keeping `toAddress` in **base58 on Tron** makes the component
cooperate rather than fight — it shows base58 untouched, and it rewrites a pasted `0x…` address
into its `T…` form for free.

The trade-off, and the thing to keep in mind when editing `App.tsx`: **app state holds the form the
user reads, not hex**. The conversion to hex happens at one place only — `normalizeTronAddress` at
the top of `submitTx`. drain-safe can afford this because the recipient is used in exactly one
place; tx-builder, with many address fields and a batch file format, could not, which is why its
policy is the opposite. Do not copy this pattern back into tx-builder.

No fork, no stylesheet rewrite, no theme risk, no new dependencies, +2 kB gzipped.

## The two facts worth remembering

1. **Canonical Safe contract addresses are not deployed on Tron.** Both networks use non-canonical
   addresses; the host resolves them from `apps/web/tron-deployments.json` in the wallet monorepo,
   not from the gateway config (whose `contractAddresses` are all `null` and never read) and not
   from `@safe-global/safe-deployments`.
2. **TRC-20 calldata is byte-identical to ERC-20** — selector `a9059cbb`, address left-padded to 32
   bytes with **no** `0x41` prefix. `src/utils/sdk-helpers.ts` needs no change, and the golden
   vectors in `src/__tests__/sdk-helpers.test.js` must stay as they are.
