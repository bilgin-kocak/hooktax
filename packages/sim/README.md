# @hooktax/sim: fork simulations (M4, M5)

Everything runs on a **local fork** of Ethereum mainnet inside `forge test`. Nothing is broadcast.

- `test/utils/TakeMeter.sol`: the meter. For one exact-input swap through the real PoolManager
  (using v4-core's `PoolSwapTest` router, deployed on the fork), it records every ERC-20 `Transfer`,
  every ERC-6909 claim transfer and every native-ETH transfer, nets them per address, and values
  third-party flows in input-token units at the pool's pre-swap mid price. The result is the
  **take**: value to the hook, its owner or other addresses, as a share of the swap input. The LP fee
  comes from the PoolManager's `Swap` event and is reported separately. Failures become explicit
  statuses: `hook-reverted`, `no-liquidity`, `unsupported-token` or `swap-failed`.
- `src/SneakyFeeHook.sol` + `test/SneakyFeeHookDemo.t.sol` (M5): a planted, upgradeable demo hook.
  Its proxy address is mined to `BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA` (0x88). v1 takes 0.3%;
  after the owner upgrades it to v2, it takes 100%.
- `runner/`: TypeScript drivers. They pin the fork block, run forge, parse its output and write
  `data/sim-results.json`.

```bash
make demo
```

```bash
make measure
```

The fork RPC is `MAINNET_RPC_URL`, or a keyless public endpoint when that is unset. The fork block
is `FORK_BLOCK`, or the import's snapshot block.
