import { describe, expect, it } from "vitest";
import type { HookRecord, PoolRecord } from "@hooktax/core";
import { probeAmount, selectPools, selectionLines } from "./select";

describe("probeAmount (sizing only)", () => {
  it("targets ~$50 for known tokens", () => {
    expect(probeAmount("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6)).toBe(50_000_000n); // 50 USDC
    expect(probeAmount("0x0000000000000000000000000000000000000000", 18)).toBe(16_666_666_666_666_666n); // ~0.0167 ETH
    expect(probeAmount("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8)).toBe(52_631n); // ~$50 of WBTC
  });
  it("falls back to ~0.001 of a unit for unknown tokens", () => {
    expect(probeAmount("0x1234567890123456789012345678901234567890", 18)).toBe(10n ** 15n);
    expect(probeAmount("0x1234567890123456789012345678901234567890", 2)).toBe(1n);
  });
});

const pool = (id: string, hook: string, liq: string, dec = 18): PoolRecord => ({
  poolId: id,
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  symbol0: "ETH",
  symbol1: "USDC",
  decimals0: dec,
  decimals1: 6,
  fee: 3000,
  isDynamicFee: false,
  tickSpacing: 60,
  hooks: hook,
  initSqrtPriceX96: "1",
  initTick: 0,
  blockNumber: 100,
  transactionHash: "0x",
  logIndex: 0,
  state: liq === "0" ? null : { sqrtPriceX96: "1", tick: 0, protocolFee: 0, lpFee: 3000, liquidity: liq },
});
const hook = (addr: string, poolIds: string[]): HookRecord =>
  ({ address: addr, status: "ok", poolCount: poolIds.length, poolIds } as HookRecord);

describe("selectPools", () => {
  const H1 = "0x00000000000000000000000000000000000000c0";
  const H2 = "0x00000000000000000000000000000000000001c0";
  const pools = [pool("0xa", H1, "1000"), pool("0xb", H1, "0"), pool("0xc", H1, "2000"), pool("0xd", H2, "500")];
  const hooks = [hook(H1, ["0xa", "0xb", "0xc"]), hook(H2, ["0xd"])];

  it("picks active pools, one per hook, honoring limits", () => {
    const sel = selectPools(hooks, pools, { limit: 12, maxHooks: 25, perHook: 1 });
    expect(sel.map((s) => s.poolId)).toEqual(["0xa", "0xd"]); // 0xb skipped (no liquidity), one per hook
  });
  it("skips the no-liquidity pool when taking more per hook", () => {
    const sel = selectPools(hooks, pools, { limit: 12, maxHooks: 25, perHook: 5 });
    expect(sel.map((s) => s.poolId)).toEqual(["0xa", "0xc", "0xd"]);
  });
  it("respects the total limit", () => {
    expect(selectPools(hooks, pools, { limit: 1, maxHooks: 25, perHook: 5 })).toHaveLength(1);
  });
  it("single-pool selection by id", () => {
    const sel = selectPools(hooks, pools, { poolId: "0xC", limit: 12, maxHooks: 25, perHook: 1 });
    expect(sel.map((s) => s.poolId)).toEqual(["0xc"]);
  });
  it("selection lines have 8 pipe-separated fields", () => {
    const sel = selectPools(hooks, pools, { limit: 1, maxHooks: 25, perHook: 1 });
    expect(selectionLines(sel).split("\n")[0]!.split("|")).toHaveLength(8);
  });
});
