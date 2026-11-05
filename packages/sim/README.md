# sim: Foundry fork tests (M4, M5)

- **M4, measured take:** swaps a small amount through real hooked pools on a mainnet fork in both
  directions, traces every ERC-20 `Transfer` and ERC-6909 claim, and attributes value flows.
  Output: `data/sim-results.json`.
- **M5, worst case:** `SneakyFeeHook`, an upgradeable demo hook mined to `BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA`.
  v1 takes 0.3%; after an admin upgrade on the fork, v2 takes 100%. Also probes real owner/admin powers on the fork.

Runs on a **local fork only**; it never broadcasts to mainnet.

Status: planned.
