# Testing

What runs, the commands, and the results. All verified on 2026-11-05.

## Unit tests (TypeScript, Vitest) — 109 passing

```bash
make test        # pnpm -r run test
```

| Package | Tests | Covers |
|---|---:|---|
| `@hooktax/core` | 50 | permission-bit decode (all-flags, zero-flags, each single flag, a real mainnet hook, encode/decode over all 16,384 masks); every §3 capability rule; proxy classification (1967/UUPS/transparent/beacon/diamond/clone); the HookTax card |
| `@hooktax/indexer` | 15 | decoding real mainnet `Initialize` logs; adaptive log scanning (full coverage, learning a provider's range limit, rate-limit backoff, single-block failure); incremental cache + de-dup; record assembly; symbol sanitizing |
| `@hooktax/arkiv` | 15 | entity values validated through the **SDK's own schema encoder** (no network); content hashing; state-derived sync plan (create/patch/extend/delete-dup/unset); schema fits Arkiv's 31-column / 32-byte limits |
| `@hooktax/api` | 6 | bearer auth (timing-safe), body validation, 422 on unverifiable pools, 202 + job readback |
| `@hooktax/sim` | 13 | probe sizing ($50-equivalent, price-derived unpriced side); pool selection; parsing real `TakeMeter` output into SimResults |
| `@hooktax/cli` | 6 | target classification; card build from the dataset; pool→hook resolution; latest-wins + demonstrations |
| `@hooktax/web` | 4 | the exact Arkiv query text each view sends (schema tag, `ownedBy`, filters, sort); curl escaping |

Typecheck: `make` targets run `tsc` per package; `pnpm -r run typecheck` is clean.

## CRE workflow tests (bun) — 6 passing

```bash
cd cre/hooktax-refresh && bun install && bun test
```

Uses the CRE SDK's `HttpActionsMock` + test runtime against real mainnet `Initialize` log fixtures:
decodes a hooked pool, skips hookless pools without calling the API, POSTs `/refresh` with the
bearer token and verifies the answer, fails loudly on a hook mismatch and on HTTP errors.

```bash
make cre-build   # cre workflow build -> binary.wasm (compiles the workflow to WASM)
```

The build succeeds (binary hash recorded by the CLI). `cre workflow simulate` needs a CRE account
(`cre login`); see [`cre-simulation.md`](cre-simulation.md).

## Fork simulations (Foundry) — on a local mainnet fork, nothing broadcast

```bash
make demo        # SneakyFeeHook worst case
make measure ARGS="--limit 20"   # measured take on real pools
```

- **`SneakyFeeHookDemo`** (1 test, passing): preflight from facts says "100% of swap value" before
  any upgrade (bits `0x88` + EIP-1967 slot + UUPS); measures **0.30%** today in both directions;
  owner upgrade impersonated; measures **100%**, swapper receives **0**.
- **`MeasureReal`** (1 test, passing): swapped both directions through **20 real hooked pools** at
  block 26,347,887. Measured takes **0%–5.49%** — fixed-fee hooks (1%, 1.25%, 2%, 3%, 5%) with LP
  fee 0, and hooks that take 0% and charge an LP fee instead. All 20 `ok`; results in
  `data/sim-results.json`.

## End-to-end

- **M1 import** (`make index`): full cold run, deploy block → block 26,347,887, in ~53 min on a
  public RPC → 11,242 hooks, 47,130 hooked pools. Incremental re-runs scan only new blocks.
- **Arkiv** (`make arkiv-plan` / `make arkiv-estimate`): plan and unsigned cost preview run against
  the live Rabdi node (reads + `eth_estimateGas`, no signing). Projection: 35,800 entities ≈ 20.8
  tGLM. The signed write (`make arkiv-sync`) needs a funded writer — see the README checkpoint.
- **CLI** (`make check ARG=0x…`, `make atlas`): run against the committed dataset.

## Not covered / point-in-time

- The signed Arkiv write and the live web read were not exercised in CI here because the testnet
  writer was unfunded (faucet is browser+captcha only). The whole path up to the signature is
  tested (schema validation, planning, unsigned estimate).
- Fork results are one block, one swap size (see [`measurement.md`](measurement.md)).
