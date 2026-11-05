# Capability rules

Source: spec §3. Implemented in [`packages/core/src/capabilities.ts`](../packages/core/src/capabilities.ts),
with one test per row in [`packages/core/test/capabilities.test.ts`](../packages/core/test/capabilities.test.ts).

Each rule is a pure function of three onchain facts:

1. **Permission bits**: the low 14 bits of the hook address. They are fixed forever because an address
   cannot change, so even an upgradeable hook keeps them.
2. **Upgradeability**: an EIP-1967 proxy (transparent, UUPS or plain), a beacon proxy or an EIP-2535
   diamond. See [`proxy.ts`](../packages/core/src/proxy.ts). An EIP-1167 clone is **not** upgradeable.
3. **Dynamic fee**: whether any pool of the hook was initialized with `fee == 0x800000`.

| id | Condition | Text shown |
|---|---|---|
| `swap-delta` | `BEFORE_SWAP_RETURNS_DELTA` or `AFTER_SWAP_RETURNS_DELTA` | Hook can change how much you receive on swaps |
| `lp-delta` | `AFTER_ADD_LIQUIDITY_RETURNS_DELTA` or `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA` | Hook can change what LPs deposit or withdraw |
| `dynamic-fee` | any pool uses the dynamic-fee flag | Fee can change; maximum possible LP fee is 100% |
| `upgradeable` | proxy detected (see above) | Code can be replaced; ceiling = everything its permission bits allow |
| `worst-case-swap` | upgradeable **and** a swap delta bit | Worst case: up to 100% of swap value |
| `worst-case-lp` | upgradeable **and** a liquidity delta bit | Worst case: up to 100% of what LPs deposit or withdraw |
| `no-swap-cut` | no delta bits, no dynamic fee, not upgradeable | Cannot take a cut of swaps through hook logic |

## Where we are stricter than the spec's wording

The spec's row 5 reads: *"Upgradeable **and** a RETURNS_DELTA bit is set → Worst case: up to 100% of
swap value"*. That holds for the two **swap** delta bits. The two **liquidity** delta bits are only
used when liquidity is added or removed; the PoolManager never calls them on a swap. Saying
"100% of swap value" for such a hook would be false. We therefore split row 5:

- swap delta bit + upgradeable → `worst-case-swap` (exactly the spec's text)
- liquidity delta bit + upgradeable → `worst-case-lp`

## Headline worst case (for swappers)

[`worstCase()`](../packages/core/src/capabilities.ts) reduces the rules to a single level, used for
sorting and for the card:

| Level | When | Max swap take |
|---|---|---|
| `swap-100` | upgradeable and a swap delta bit | 100% (10,000 bps) |
| `fee-100` | otherwise, a dynamic-fee pool | not a hook take: the LP fee can rise to 100% |
| `code-bound` | swap delta bit, not upgradeable | whatever the current code does (see measured take) |
| `none` | everything else | 0 through hook logic |

## What "through hook logic" means

The rules cover the two ways the PoolManager lets a hook change a swap: **returned deltas**, which
need a `*_RETURNS_DELTA` bit, and **fee overrides**, which need a dynamic-fee pool. A hook could
still affect your price in other ways within your slippage limit, for example by trading in the
same pool from inside its own `beforeSwap`/`afterSwap` callbacks. The bits do not rule that out.
That is what the **measured take** (M4) is for: it traces every token movement in a real swap.
