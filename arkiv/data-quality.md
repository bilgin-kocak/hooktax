# Data quality

## Source and trust

- **Source:** Ethereum mainnet, read over JSON-RPC. Uniswap v4 PoolManager `Initialize` events
  (`0xdd466e…`), plus contract bytecode, EIP-1967 storage slots, `owner()` / `proxiableUUID()` /
  beacon / diamond view calls, and pool state from StateView. **No Sourcify data** (excluded by
  Arkiv's rules) and **no Etherscan content**. Fork measurements come from swaps on a local fork.
- **Trust:** every entity is owned by the HookTax writer wallet; readers filter `.ownedBy(writer)`.
  Capability flags are derived deterministically from onchain facts ([`docs/capability-rules.md`](../docs/capability-rules.md))
  and unit-tested, so a reader can re-derive them from the same facts.

## Freshness

| Mechanism | What it keeps fresh | Cadence |
|---|---|---|
| Incremental import (`make index`) | hooks, pools | manual / scheduled; only new blocks are scanned (cursor in `data/cache/`) |
| CRE workflow → `POST /refresh` | a single new hooked pool + its hook | on every `Initialize` event with a hook |
| `make measure` / CRE `simulate` step | `SimResult` takes | before the 7-day expiry |
| `SimResult` 7-day expiry | removes stale safety numbers | enforced by the Arkiv node |

An import records a `hooktax.v1.import` entity (block, counts, timestamp); the web app's header
reads the latest one so a viewer can see how old the atlas is. `SimResult` freshness is visible per
row via `$expiresAt`.

## Re-running the importer

```bash
make index          # incremental: scans only blocks after the last run, up to the finalized block
```

A full cold import (deploy block → latest) read ~4.66M blocks and all hook/pool/token state in
**~53 minutes** against a public RPC; re-runs are near-instant until new pools appear. Then:

```bash
make arkiv-plan      # read-only: what would change on Arkiv
make arkiv-estimate  # unsigned gas estimate + projected tGLM
make arkiv-sync      # write (needs a funded ARKIV_PRIVATE_KEY)
```

`contentHash` on each hook/pool means a re-sync only rewrites entities whose facts changed, and
extends those near expiry — not the whole atlas.

## Filter coverage

Every search the UI offers maps to an **indexed** column, so it is a real server-side Arkiv
predicate, not client-side filtering of a full download:

- "can change swap amounts" → `canAffectSwapAmounts = true`
- "upgradeable" → `isUpgradeable = true`
- "worst case 100% of swap value" → `worstCase = str('swap-100')`
- "dynamic-fee pool" → `hasDynamicFeePool = true`
- "has live liquidity" → `activePoolCount > 0`
- "measured on a fork" → `EXISTS(lastMeasuredTakeBps)`
- each of the 14 permission bits, by name
- hook address, owner address; sort by pool count / active pools / measured take / first seen

Pagination is by `$key` for exact-once reads (the importer's own re-reads) and by offset for the
UI's page buttons.

## Known gaps (honest)

- **Not all 47,130 hooked pools are mirrored** — only the 24,535 with live liquidity, because a
  swap can only be measured where there is liquidity, and a full mirror costs ~20.8 tGLM (see
  [`reach.md`](reach.md)). The full dataset is in the committed `data/*.json`.
- **Fork measurements cover a sample**: 20 pools of the highest-pool-count hooks (`make measure`)
  plus 24 pools of the worst-case-100% hooks (`make probe`); the rest carry their capability flags
  (from bits + proxy) but no measured take yet. Pools with no priced token are skipped for
  measurement (can't size a meaningful swap).
- **"Upgradeable" can overstate.** The upgrade probes found two hooks behind an OpenZeppelin 5.0.0
  ProxyAdmin whose ownership is renounced, and one whose implementation reverts
  `UpgradesDisabled()`. The indexer classifies by proxy slots, so these still show
  `isUpgradeable = true`; their SimResult explains why the worst case was not demonstrated. A
  follow-up is to check the ProxyAdmin's `owner()` in the indexer.
- **Unverified bytecode** limits what admin probes can be tried on upgradeable hooks; a power we
  could not exercise on the fork is reported as "not demonstrated", never as "absent".
- **A >100% take is not a take.** One committed result (pool `0x6fc55403…`) predated the guard
  and claimed 92,648%; it was re-derived to "not determined" and its Arkiv entity replaced (see
  [`docs/measurement.md`](../docs/measurement.md)).
