import { describe, expect, it } from "vitest";
import type { HookRecord, PoolRecord } from "@hooktax/core";
import { depthUsd, hookTier, mirrorPriority, poolTier } from "../src/priority";

const ETH = "0x0000000000000000000000000000000000000000";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const MEME = "0x1111111111111111111111111111111111111111";
const Q96 = 2n ** 96n;

const hook = (address: string, over: Partial<HookRecord> = {}): HookRecord =>
  ({
    address,
    poolIds: [],
    isUpgradeable: false,
    canAffectSwapAmounts: false,
    hasDynamicFeePool: false,
    worstCase: { level: "none", text: "", maxSwapTakeBps: 0 },
    ...over,
  }) as unknown as HookRecord;

const pool = (poolId: string, hooks: string, liquidity: bigint, sqrtPriceX96 = Q96, c0 = ETH, c1 = MEME): PoolRecord =>
  ({
    poolId,
    hooks,
    currency0: c0,
    currency1: c1,
    decimals0: 18,
    decimals1: 18,
    state: { sqrtPriceX96: sqrtPriceX96.toString(), tick: 0, protocolFee: 0, lpFee: 0, liquidity: liquidity.toString() },
  }) as unknown as PoolRecord;

describe("depthUsd (ranking only)", () => {
  it("values the virtual reserve of the priced side at the current price", () => {
    // price 1 (sqrtP = 1): virtual reserve0 = L = 2e18 raw ETH = 2 ETH = $6,000
    expect(depthUsd(pool("0xa", "0xh", 2n * 10n ** 18n))).toBeCloseTo(6000, 6);
  });

  it("uses the token1 side when only token1 is priced", () => {
    // sqrtP = 2: reserve1 = L * 2 = 2e6 raw USDC = $2
    const p = pool("0xa", "0xh", 10n ** 6n, 2n * Q96, MEME, USDC);
    (p as { decimals1: number }).decimals1 = 6;
    expect(depthUsd(p)).toBeCloseTo(2, 6);
  });

  it("is 0 when neither side is priced or the pool has no state", () => {
    expect(depthUsd(pool("0xa", "0xh", 10n ** 30n, Q96, MEME, MEME))).toBe(0);
    expect(depthUsd({ ...pool("0xa", "0xh", 1n), state: null } as PoolRecord)).toBe(0);
  });
});

describe("tiers", () => {
  const measured = new Set(["0xm"]);
  it("orders worst case 100% > measured > upgradeable > swap delta > dynamic fee > rest", () => {
    expect(hookTier(hook("0xa", { worstCase: { level: "swap-100" } as HookRecord["worstCase"] }), measured)).toBe(0);
    expect(hookTier(hook("0xm"), measured)).toBe(1);
    expect(hookTier(hook("0xa", { isUpgradeable: true }), measured)).toBe(2);
    expect(hookTier(hook("0xa", { canAffectSwapAmounts: true }), measured)).toBe(3);
    expect(hookTier(hook("0xa", { hasDynamicFeePool: true }), measured)).toBe(4);
    expect(hookTier(hook("0xa"), measured)).toBe(5);
  });

  it("a measured pool outranks other pools of a plain swap-delta hook", () => {
    const h = hook("0xh", { canAffectSwapAmounts: true });
    expect(poolTier(pool("0xp", "0xh", 1n), h, new Set(["0xp"]), new Set())).toBe(1);
    expect(poolTier(pool("0xq", "0xh", 1n), h, new Set(["0xp"]), new Set())).toBe(3);
  });
});

describe("mirrorPriority", () => {
  it("sorts by tier, then by depth (deepest first), then by id for stability", () => {
    const risky = hook("0xr", { worstCase: { level: "swap-100" } as HookRecord["worstCase"], poolIds: ["0x3"] });
    const plain = hook("0xp", { poolIds: ["0x1", "0x2"] });
    const pools = [pool("0x1", "0xp", 10n ** 18n), pool("0x2", "0xp", 5n * 10n ** 18n), pool("0x3", "0xr", 1n)];
    const pr = mirrorPriority([plain, risky], pools, []);
    const ids = ["0x1", "0x2", "0x3"].sort((a, b) => pr.comparePools(a, b));
    expect(ids).toEqual(["0x3", "0x2", "0x1"]);
    expect(["0xp", "0xr"].sort((a, b) => pr.compareHooks(a, b))).toEqual(["0xr", "0xp"]);
  });

  it("ranks a hook within its tier by its deepest active pool", () => {
    const a = hook("0xa", { poolIds: ["0x1"] });
    const b = hook("0xb", { poolIds: ["0x2"] });
    const pr = mirrorPriority([a, b], [pool("0x1", "0xa", 1n), pool("0x2", "0xb", 10n ** 18n)], []);
    expect(["0xa", "0xb"].sort((x, y) => pr.compareHooks(x, y))).toEqual(["0xb", "0xa"]);
  });

  it("counts any non-demo SimResult as measured, for the pool and its hook", () => {
    const a = hook("0xa", { canAffectSwapAmounts: true, poolIds: ["0x1"] });
    const b = hook("0xb", { canAffectSwapAmounts: true, poolIds: ["0x2"] });
    const sims = [
      { poolId: "0x1", hook: "0xA", isDemo: false },
      { poolId: "0x2", hook: "0xB", isDemo: true },
    ] as never[];
    const pr = mirrorPriority([a, b], [pool("0x1", "0xa", 1n), pool("0x2", "0xb", 10n ** 20n)], sims);
    expect(["0xb", "0xa"].sort((x, y) => pr.compareHooks(x, y))).toEqual(["0xa", "0xb"]);
  });
});
