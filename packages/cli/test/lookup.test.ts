import { describe, expect, it } from "vitest";
import { computeCapabilities, decodePermissions, worstCase, type HookRecord, type PoolRecord, type SimResultRecord } from "@hooktax/core";
import { arkivQueryFor, check, classifyTarget, type Dataset } from "../src/lookup";

const HOOK = "0x0000fe59823933ac763611a69c88f91d45f81888"; // bits 0x1888, swap delta
function hookRec(over: Partial<HookRecord> = {}): HookRecord {
  const permissions = decodePermissions(HOOK);
  const capIn = { permissions, isUpgradeable: true, hasDynamicFeePool: false };
  return {
    address: "0x0000fE59823933AC763611a69c88F91d45F81888",
    permissionBits: 0x1888,
    permissions,
    permissionNames: [],
    code: { size: 100, hash: "0x" },
    proxy: { type: "eip1967-uups", isUpgradeable: true, implementation: null, implementationCodeHash: null, admin: null, beacon: null, upgradeAuthority: null, upgradeAuthoritySource: null },
    owner: null,
    ownerIsContract: null,
    poolCount: 1,
    poolIds: ["0x" + "aa".repeat(32)],
    dynamicFeePoolCount: 0,
    hasDynamicFeePool: false,
    firstSeenBlock: 1,
    isUpgradeable: true,
    canAffectSwapAmounts: true,
    canAffectLpAmounts: false,
    capabilities: computeCapabilities(capIn),
    worstCase: worstCase(capIn),
    status: "ok",
    ...over,
  };
}
const poolRec: PoolRecord = {
  poolId: "0x" + "aa".repeat(32),
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  symbol0: "ETH", symbol1: "USDC", decimals0: 18, decimals1: 6,
  fee: 3000, isDynamicFee: false, tickSpacing: 60, hooks: hookRec().address,
  initSqrtPriceX96: "1", initTick: 0, blockNumber: 1, transactionHash: "0x", logIndex: 0,
  state: { sqrtPriceX96: "1", tick: 0, protocolFee: 0, lpFee: 3000, liquidity: "100" },
};
const sim = (scenario: string, take: number | null, over: Partial<SimResultRecord> = {}): SimResultRecord => ({
  simId: `${poolRec.poolId}:${scenario}:100`, poolId: poolRec.poolId, hook: hookRec().address, scenario,
  isDemo: false, forkBlock: 100, measuredAt: scenario === "today" ? 10 : 20, status: "ok",
  measuredTakeBps: take, lpFeeBps: 30, directions: [], ...over,
});

const data: Dataset = { hooks: [hookRec()], pools: [poolRec], sims: [sim("today", 30)], snapshotBlock: 100 };

describe("classifyTarget", () => {
  it("distinguishes hook addresses, pool ids and junk", () => {
    expect(classifyTarget("0x" + "11".repeat(20)).kind).toBe("hook");
    expect(classifyTarget("0x" + "11".repeat(32)).kind).toBe("pool");
    expect(classifyTarget("nope").kind).toBe("invalid");
  });
});

describe("check", () => {
  it("builds a card for a hook with a measured take", () => {
    const res = check(classifyTarget(HOOK), data);
    if ("error" in res) throw new Error(res.error);
    expect(res.today?.measuredTakeBps).toBe(30);
    const byLabel = Object.fromEntries(res.card.lines.map((l) => [l.label, l.value]));
    expect(byLabel["Measured take today"]).toMatch(/^0\.3% of swap input/);
    expect(res.card.capabilities.map((c) => c.id)).toContain("worst-case-swap");
  });

  it("resolves a pool to its hook and scopes sims to the pool", () => {
    const res = check(classifyTarget(poolRec.poolId), data);
    if ("error" in res) throw new Error(res.error);
    expect(res.pool?.poolId).toBe(poolRec.poolId);
    expect(res.hook.address.toLowerCase()).toBe(HOOK);
  });

  it("prefers the latest 'today' and surfaces demonstrations", () => {
    const d2: Dataset = { ...data, sims: [sim("today", 30, { measuredAt: 10 }), sim("today", 50, { measuredAt: 99, simId: "x" }), sim("after-admin-upgrade", 10000, { label: "v2" })] };
    const res = check(classifyTarget(HOOK), d2);
    if ("error" in res) throw new Error(res.error);
    expect(res.today?.measuredTakeBps).toBe(50);
    expect(res.demonstrations).toHaveLength(1);
    expect(res.card.lines.find((l) => l.label === "Demonstrated worst case")!.value).toMatch(/100% of swap input after "v2"/);
  });

  it("errors on unknown pool / junk", () => {
    expect(check(classifyTarget("0x" + "cd".repeat(32)), data)).toHaveProperty("error");
    expect(check(classifyTarget("hello"), data)).toHaveProperty("error");
  });

  it("arkiv query names the schema, writer and hook", () => {
    expect(arkivQueryFor(hookRec(), "0xWRITER")).toBe("arkiv.schema = str('hooktax.v1.hook') AND $owner = addr(0xWRITER) AND hook = addr(0x0000fE59823933AC763611a69c88F91d45F81888)");
  });
});
