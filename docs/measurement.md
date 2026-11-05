# How HookTax measures "take"

HookTax reports two things about a hook: its **capabilities** (what the hook *could* do, from
onchain facts) and its **measured take** (what it *did* do to a real swap on a fork). This page is
the measured-take method. Capabilities are in [`capability-rules.md`](capability-rules.md).

Measurement, not accusation: the output is a number and a status, never a label like "scam".

## The question

For one swap through a pool, how much value went to someone **other than** the swapper, the
PoolManager, and the pool's liquidity providers? That "someone" is the hook, the hook's owner, or
any other address the swap touched. Expressed as a fraction of the swap input, that is the **take**.
The normal LP fee is reported separately and is never counted as take.

## The method ([`packages/sim/test/utils/TakeMeter.sol`](../packages/sim/src/../test/utils/TakeMeter.sol))

Everything runs inside `forge test` on a **local fork** of Ethereum mainnet. Nothing is broadcast.

1. **Fork** mainnet at a pinned block (the import's snapshot block, so measurements match the
   dataset). Deploy v4-core's `PoolSwapTest` router onto the fork.
2. **Size** a small probe: ~$50-equivalent of the input token. The USD price is used only to size
   the swap; if only one side of the pool is a priced token, the other side's amount is derived
   from the pool's own price, so a dust-valued token can't distort the result. Pools with no priced
   token are skipped (`not measured`).
3. **Fund** a fresh swapper with exactly that amount (`deal`, or `vm.deal` for native ETH) and run
   one **exact-input** swap, in each direction.
4. **Trace** everything during the swap:
   - every ERC-20 `Transfer` event (`vm.recordLogs`),
   - every ERC-6909 claim `Transfer` emitted by the PoolManager (v4's internal accounting),
   - every native-ETH movement (`vm.startStateDiffRecording`).
5. **Net** the flows per `(address, token)`.
6. **Attribute** each address to a role: the swapper (and the router, which forwards for them), the
   PoolManager (pool reserves + LP fees stay inside it), the **hook**, the **hook owner**, or
   **other**. Flows in the input token count directly; flows in the output token are valued in
   input-token units at the pool's **pre-swap mid price** (`sqrtPriceX96`).
7. **take = (value to hook + owner + others) / amountIn**, in basis points. The LP fee comes from
   the PoolManager's `Swap` event (`fee` field) and is reported on its own.

## Statuses, never silent zeros

A swap that doesn't produce a clean number is recorded as an explicit status, not as `take = 0`:

| Status | Meaning |
|---|---|
| `ok` | measured |
| `hook-reverted` | the hook reverted the swap (detected from the PoolManager's `WrappedError(hook, …)`) |
| `no-liquidity` | the pool had no in-range liquidity to swap against |
| `unsupported-token` | a pool token could not be funded/approved on the fork (e.g. non-standard ERC-20) |
| `swap-failed` | the swap reverted for another reason |

## A guard against meaningless ratios

With both directions sized to ~$50, a take above **100% of input** is not a plain swap cut — it
means a third party (often the hook or owner also acting as an LP or arbitrageur *within the same
transaction*) netted more than the swapper paid. HookTax keeps that direction's full flow trace but
**excludes it from the headline take and notes it**, rather than printing a number like "195
billion %". This happened on 2 of the first 20 pools before the price-aware sizing fix; see
[`arkiv/data-quality.md`](../arkiv/data-quality.md).

## Worst case, proved ([`packages/sim/test/SneakyFeeHookDemo.t.sol`](../packages/sim/test/SneakyFeeHookDemo.t.sol))

The same meter proves the capability ceiling for an upgradeable hook. `SneakyFeeHook` is planted on
the fork with its proxy address mined to `BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA`. HookTax says, from
the bits + the EIP-1967 slot alone, "worst case: 100% of swap value" — *before* any upgrade. v1
measures 0.30%; the owner is impersonated and upgrades to v2; it measures 100%, swapper receives 0.
For real upgradeable mainnet hooks, the same fork-impersonation approach probes known admin powers
and records only what actually executed ("not demonstrated" otherwise).

## Limits

- One block, one small swap size: a fixed-fee hook's take is scale-invariant, but a hook whose take
  depends on size or on other state is only sampled.
- Mid-price valuation of output-token flows is approximate for illiquid pools (hence the >100%
  guard).
- We measure what a hook *did* to our probe swap, not everything it *could* do — that is what the
  capability rules and the worst-case demo are for.
