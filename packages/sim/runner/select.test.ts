import { describe, expect, it } from "vitest";
import type { HookRecord, PoolRecord } from "@hooktax/core";
import { pricedAmount, probeAmounts, selectPools, selectionLines } from "./select";

describe("pricedAmount (sizing only)", () => {
  it("targets ~$50 for known tokens", () => {
    expect(pricedAmount("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6)).toBe(50_000_000n); // 50 USDC
    expect(pricedAmount("0x0000000000000000000000000000000000000000", 18)).toBe(16_666_666_666_666_666n); // ~0.0167 ETH
    expect(pricedAmount("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8)).toBe(52_631n); // ~$50 of WBTC
  });
  it("returns null for unknown tokens", () => {
    expect(pricedAmount("0x1234567890123456789012345678901234567890", 18)).toBeNull();
  });
});

describe("probeAmounts", () => {
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const MEME = "0x1234567890123456789012345678901234567890";
  // price p (token1 per token0, raw) = (sqrt/2^96)^2. Pick sqrt = 2^96 -> p = 1.
  const SQRT_ONE = 1n << 96n;

  it("derives the unpriced side from the pool price (p=1 -> equal raw amounts)", () => {
    const a = probeAmounts(WETH, 18, MEME, 18, SQRT_ONE)!;
    expect(a.amount0In).toBe(16_666_666_666_666_666n); // $50 of WETH
    expect(a.amount1In).toBe(16_666_666_666_666_666n); // same raw units at p=1
  });
  it("derives token0 when only token1 is priced", () => {
    const a = probeAmounts(MEME, 18, WETH, 18, SQRT_ONE)!;
    expect(a.amount1In).toBe(16_666_666_666_666_666n);
    expect(a.amount0In).toBe(16_666_666_666_666_666n);
  });
  it("returns null when neither token is priced", () => {
    expect(probeAmounts(MEME, 18, "0xdead000000000000000000000000000000000000", 18, SQRT_ONE)).toBeNull();
  });
});

const pool = (id: string, hook: string, liq: string, over: Partial<PoolRecord> = {}): PoolRecord => ({
  poolId: id,
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  symbol0: "ETH",
  symbol1: "USDC",
  decimals0: 18,
  decimals1: 6,
  fee: 3000,
  isDynamicFee: false,
  tickSpacing: 60,
  hooks: hook,
  initSqrtPriceX96: (1n << 96n).toString(),
  initTick: 0,
  blockNumber: 100,
  transactionHash: "0x",
  logIndex: 0,
  state: liq === "0" ? null : { sqrtPriceX96: (1n << 96n).toString(), tick: 0, protocolFee: 0, lpFee: 3000, liquidity: liq },
  ...over,
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
    expect(sel.map((s) => s.poolId)).toEqual(["0xa", "0xd"]);
  });
  it("skips the no-liquidity pool when taking more per hook", () => {
    const sel = selectPools(hooks, pools, { limit: 12, maxHooks: 25, perHook: 5 });
    expect(sel.map((s) => s.poolId)).toEqual(["0xa", "0xc", "0xd"]);
  });
  it("skips pools where neither token is priced", () => {
    const unpriced = pool("0xe", H2, "500", { currency0: "0x1111111111111111111111111111111111111111", currency1: "0x2222222222222222222222222222222222222222", symbol0: null, symbol1: null });
    const sel = selectPools([hook(H2, ["0xe"])], [unpriced], { limit: 12, maxHooks: 25, perHook: 5 });
    expect(sel).toHaveLength(0);
  });
  it("respects the total limit", () => {
    expect(selectPools(hooks, pools, { limit: 1, maxHooks: 25, perHook: 5 })).toHaveLength(1);
  });
  it("single-pool selection by id", () => {
    expect(selectPools(hooks, pools, { poolId: "0xC", limit: 12, maxHooks: 25, perHook: 1 }).map((s) => s.poolId)).toEqual(["0xc"]);
  });
  it("selection lines have 8 pipe-separated fields", () => {
    const sel = selectPools(hooks, pools, { limit: 1, maxHooks: 25, perHook: 1 });
    expect(selectionLines(sel).split("\n")[0]!.split("|")).toHaveLength(8);
  });
});
