# Testing

What runs, the commands, and the results. All verified on 2026-11-05.

## Unit tests (TypeScript, Vitest) — 144 passing

```bash
make test        # pnpm -r run test
```

| Package | Tests | Covers |
|---|---:|---|
| `@hooktax/core` | 52 | permission-bit decode (all-flags, zero-flags, each single flag, a real mainnet hook, encode/decode over all 16,384 masks); every §3 capability rule; proxy classification (1967/UUPS/transparent/beacon/diamond/clone); the HookTax card, incl. "not determined" takes and decoded "not demonstrated" probe reasons |
| `@hooktax/indexer` | 15 | decoding real mainnet `Initialize` logs; adaptive log scanning (full coverage, learning a provider's range limit, rate-limit backoff, single-block failure); incremental cache + de-dup; record assembly; symbol sanitizing |
| `@hooktax/arkiv` | 35 | entity values validated through the **SDK's own schema encoder** (no network); content hashing (incl. SimResults); state-derived sync plan (create/patch/extend/delete-dup/unset) and the readonly replace plan; risk-first mirror order on the real dataset (35 worst-case hooks first, measured pools before plain ones); SimResult expiry anchored to `measuredAt`, never re-creating expired ones; batch splitting when the node refuses an estimate, proportional shrink; schema fits Arkiv's limits |
| `@hooktax/api` | 6 | bearer auth (timing-safe), body validation, 422 on unverifiable pools, 202 + job readback |
| `@hooktax/sim` | 25 | probe sizing ($50-equivalent, price-derived unpriced side); pool selection; parsing real `TakeMeter` output into SimResults; `headlineTake` (the >100% rule, incl. the real 0x6fc55403 case); upgrade-probe records (demonstrated / not-run, decoded reasons), probe target selection; a re-measure never drops a demonstration |
| `@hooktax/cli` | 6 | target classification; card build from the dataset; pool→hook resolution; latest-wins + demonstrations |
| `@hooktax/web` | 5 | the exact Arkiv query text each view sends (schema tag, `ownedBy`, filters, sort); curl escaping; writer address fallback for a build without `.env` |

Typecheck: `make` targets run `tsc` per package; `pnpm -r run typecheck` is clean. The same tests
run in CI on every push to `main` (`.github/workflows/pages.yml`) before the web app is deployed.

## CRE workflow tests (bun) — 8 passing

```bash
cd cre/hooktax-refresh && bun install && bun test
```

Uses the CRE SDK's `HttpActionsMock` + test runtime against real mainnet `Initialize` log fixtures:
decodes a hooked pool, skips hookless pools without calling the API, POSTs `/refresh` with the
bearer token and verifies the answer, fails loudly on a hook mismatch and on HTTP errors, and
validates `refreshUrl` without relying on the runtime's `URL`.

```bash
make cre-build   # cre workflow build -> binary.wasm (compiles the workflow to WASM)
```

The build succeeds and is reproducible (same binary hash on two machines). **`cre workflow
simulate` ran successfully** against a real mainnet `Initialize`, through the API's `/refresh`; the
output is in [`cre-simulation.md`](cre-simulation.md).

## Fork simulations (Foundry) — on a local mainnet fork, nothing broadcast

```bash
make demo        # SneakyFeeHook worst case
make measure ARGS="--limit 20"   # measured take on real pools
make probe       # worst case on real upgradeable swap-delta hooks
```

- **`SneakyFeeHookDemo`** (1 test, passing): preflight from facts says "100% of swap value" before
  any upgrade (bits `0x88` + EIP-1967 slot + UUPS); measures **0.30%** today in both directions;
  owner upgrade impersonated; measures **100%**, swapper receives **0**.
- **`MeasureReal`** (1 test, passing): swapped both directions, each from the block's state, through
  **18 real hooked pools** with a priced token at block 26,347,887 (2 earlier results on unpriced
  pools are kept as they were). Measured takes **0%–5.49%**: fixed-fee hooks (1%, 1.25%, 1.5%, 2%,
  3%, 5%) with LP fee 0, and hooks that take 0% and charge an LP fee instead. All `ok`.
- **`ProbeUpgrade`** (1 test, passing): the **35** hooks whose worst case is 100% of swap value;
  **24** have a priced pool with liquidity. For each: measure today, impersonate the upgrade
  authority, try the known upgrade paths, measure again. **19 demonstrated** (0%–9.9% today →
  98.13%–100%); 5 not demonstrated with decoded reasons (2 renounced ProxyAdmins, 1
  `UpgradesDisabled()`, 2 with no authority). ~6 minutes cold, seconds with Foundry's fork cache.
  Results in `data/sim-results.json`; method in [`measurement.md`](measurement.md).

## End-to-end

- **M1 import** (`make index`): full cold run, deploy block → block 26,347,887, in ~53 min on a
  public RPC → 11,242 hooks, 47,130 hooked pools. Incremental re-runs scan only new blocks.
- **Arkiv** (`make arkiv-plan` / `make arkiv-estimate` / `make arkiv-sync`): plan and unsigned cost
  preview against the live Rabdi node, then the **signed write** from the funded writer. A 44-op
  smoke write replaced the 22 SimResults (incl. the corrected 0x6fc55403) and was read back before
  the full write. The full write then mirrored **everything: 11,242 `Hook`, 24,535 `Pool`, 70
  `SimResult` and 1 `Import` entities**, 2,044 writer transactions in all (the last 1,320 from the
  GitHub Actions workflow [`.github/workflows/arkiv-sync.yml`](../.github/workflows/arkiv-sync.yml),
  which retries and re-plans on its own). A read-back that walked every hook and pool by key found
  each natural ID exactly once (no duplicates across the restarts).
- **CRE** (`make cre-sim`): a real `Initialize` log → workflow → `POST /refresh` → index + fork
  simulate (mirror skipped while the full sync owned the writer); see
  [`cre-simulation.md`](cre-simulation.md).
- **Web**: the static page is deployed to GitHub Pages and reads Arkiv from the browser; the
  documented `curl` query returns live HookAtlas entities.
- **CLI** (`make check ARG=0x…`, `make atlas`): run against the committed dataset.

## Not covered / point-in-time

- Signed Arkiv writes are exercised against the live testnet, not in CI (CI has no key).
- Fork results are one block, one swap size (see [`measurement.md`](measurement.md)).
