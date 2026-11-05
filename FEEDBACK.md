# Uniswap v4 developer feedback

Feedback from building **HookTax** — a tool that answers "what can this pool's hook take from me?"
— on Uniswap v4 during ETHGlobal Mumbai. 🧑 The human developer submits this via the Uniswap
Developer Feedback Form.

Context: we indexed all 186,872 v4 pools on Ethereum mainnet (47,130 hooked, 11,242 unique hooks),
decoded hook permissions, detected upgradeable hooks, and measured real swap "take" on a fork using
v4-core's test routers. So this is feedback from touching the event schema, the periphery, and the
hook model at scale.

## What worked really well

- **Permissions encoded in the hook address.** Putting the 14 permission bits in the low bits of the
  hook address is elegant and, for a safety tool, perfect: a hook's permissions are a verifiable
  fact about its address that can never change, with no call and no trust. Half of HookTax's value
  (the capability ceiling) falls straight out of this.
- **`StateView`.** `getSlot0` / `getLiquidity` made reading pool state across 47k pools clean and
  cheap. Thank you for shipping a canonical lens.
- **Test routers.** `PoolSwapTest` and `PoolModifyLiquidityTest` made fork-based measurement
  straightforward — deploy onto the fork, swap, trace. Our whole measured-take method depends on
  them.
- **`HookMiner`.** Mining a hook address for a required permission mask (for our planted demo hook)
  was painless with `v4-periphery/test/shared/HookMiner.sol`.

## Friction, with the biggest first

1. **`hooks` is not an indexed field in the `Initialize` event.**
   `event Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1,
   uint24 fee, int24 tickSpacing, IHooks hooks, uint160 sqrtPriceX96, int24 tick)` — `hooks` is in
   the data, not the topics. So *any* tool that cares specifically about hooked pools (a wallet
   risk check, an indexer, our Chainlink CRE log trigger) cannot filter for `hooks != 0` at the log
   level. It must pull **every** `Initialize` event (186,872 of them) and filter in code; 74% are
   hookless and discarded. Indexing `hooks`, or emitting a lightweight companion event for hooked
   initializations, would make hook-aware tooling dramatically cheaper and let a CRE/subgraph
   trigger fire only on hooked pools.

2. **No canonical on-chain hook registry or metadata interface.** There is no standard way to ask
   "what hooks exist?" or "what does this hook claim to do / who runs it?". HookTax exists partly to
   reconstruct that from events + bytecode. A minimal registry, or an optional `IHookMetadata`
   (name, owner, fee policy, upgrade authority), would let wallets show users something before they
   trade, instead of every tool re-deriving it.

3. **"Take" is hard to separate from the LP fee.** To tell a user how much a hook skims, we trace
   ERC-20 `Transfer`s, ERC-6909 claim transfers, and `BalanceDelta`s, then net per address. That is
   a lot of machinery for a question users actually ask. A standard way for a hook to *declare* the
   fee it takes (beyond the dynamic-fee flag) — e.g. an event on each swap, or a view — would make
   hook economics legible without a fork simulation.

4. **The full set of ways a hook can change swap economics is subtle.** `BEFORE/AFTER_SWAP_RETURNS_DELTA`,
   the dynamic-fee flag, `OVERRIDE_FEE_FLAG`, and a hook trading inside its own callback are four
   different levers with different permission requirements. A single doc page enumerating "all the
   ways a hook can alter what a swapper receives, and the bit/flag each needs" would be gold for
   risk tooling (and we'd happily contribute ours).

5. **v4-periphery has no release tags.** We pinned v4-core to `v4.0.0` but had to pin v4-periphery to
   a `main` commit SHA (`c6e4754`) for reproducibility, since there are no tags. A tagged release
   (even `v1.0.0-rc`) would make downstream builds reproducible.

6. **`HookMiner` lives in `test/shared`.** Address mining is a first-class need for *deploying* any
   hook, not just testing. Promoting it to a published `src` util (or a small package) would save
   every hook developer from vendoring a test file.

## Net

v4's hook model is the most tooling-friendly AMM design we've built against — the address-bit
permissions especially. The gaps above are mostly about **making hook risk legible to end users**:
an indexed `hooks` field and an optional hook-metadata/fee-declaration standard would let wallets
and routers surface "what can this hook take?" without a tool like HookTax having to reconstruct it
from first principles.
