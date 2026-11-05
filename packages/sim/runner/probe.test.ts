import { describe, expect, it } from "vitest";
import { probeOutcome, type HookRecord, type PoolRecord } from "@hooktax/core";
import { parseLines, supersededByMeasure, toProbeRecords } from "./parse";
import { selectProbeTargets } from "./select";

const P1 = "0x" + "11".repeat(32);
const P2 = "0x" + "22".repeat(32);
const H1 = "0x00000000000000000000000000000000000028cc";
const H2 = "0x0000000000000000000000000000000000003fff";
const CALLER = "0x4488344E5957d8C027E73f97b2aC27208db0277B";
const ETH = "0x0000000000000000000000000000000000000000";
const TOK = "0x1111111111111111111111111111111111111111";
const PM = "0x000000000004444c5dc75cB358380D2e3dE08A90";
const SW = "0x00000000000000000000000000000000000000aa";
const RT = "0x00000000000000000000000000000000000000bb";
const REC = "0x00000000000000000000000000000000000000cc";

const swap = (pool: string, scenario: string, z: boolean, takeX100: number, out: string) =>
  `SWAP|${pool}|${scenario}|${z}|ok|${z ? ETH : TOK}|${z ? TOK : ETH}|1000|${out}|${takeX100 / 100}|${takeX100}|3000|${SW}|${RT}|0x`;

const text = [
  // pool 1: upgrade executed on the second path; take 0.3% today, 100% after
  swap(P1, "today", true, 3000, "990"),
  swap(P1, "today", false, 2999, "990"),
  `PROBE|${P1}|${H1}|ProxyAdmin.upgradeAndCall|${CALLER}|false|0x08c379a0`,
  `PROBE|${P1}|${H1}|ProxyAdmin.upgrade|${CALLER}|true|0x`,
  swap(P1, "after-admin-upgrade", true, 1_000_000, "0"),
  `FLOW|${P1}|after-admin-upgrade|true|${REC}|${ETH}|1|1000`,
  `FLOW|${P1}|after-admin-upgrade|true|${PM}|${ETH}|1|0`,
  swap(P1, "after-admin-upgrade", false, 1_000_000, "0"),
  // pool 2: nothing executed
  swap(P2, "today", true, 0, "997"),
  swap(P2, "today", false, 0, "997"),
  `PROBE|${P2}|${H2}|proxy.upgradeToAndCall|${CALLER}|false|0x`,
  `PROBE|${P2}|${H2}|proxy.upgradeTo|${CALLER}|false|0x`,
].join("\n");

describe("toProbeRecords", () => {
  const run = parseLines(text);
  const recs = toProbeRecords(run, {
    forkBlock: 26347887,
    measuredAt: 1,
    hookByPool: new Map([
      [P1, H1],
      [P2, H2],
    ]),
    ownerByHook: new Map(),
  });
  const get = (pool: string, scenario: string) => recs.find((r) => r.poolId === pool && r.scenario === scenario)!;

  it("parses every PROBE line", () => {
    expect(run.probes).toHaveLength(4);
    expect(run.probes[1]).toMatchObject({ method: "ProxyAdmin.upgrade", executed: true });
  });

  it("a demonstrated upgrade is a measured after-admin-upgrade result with its attempts", () => {
    const after = get(P1, "after-admin-upgrade");
    expect(after).toMatchObject({ status: "ok", measuredTakeBps: 10_000, isDemo: false, label: "authority upgrade (ProxyAdmin.upgrade)" });
    expect(after.probes!.map((p) => [p.method, p.executed])).toEqual([
      ["ProxyAdmin.upgradeAndCall", false],
      ["ProxyAdmin.upgrade", true],
    ]);
    expect(after.simId).toBe(`${P1}:after-admin-upgrade:26347887`);
    expect(get(P1, "today").measuredTakeBps).toBe(30);
  });

  it("an upgrade that did not execute is an explicit not-run result, never a zero", () => {
    const after = get(P2, "after-admin-upgrade");
    expect(after).toMatchObject({ status: "not-run", measuredTakeBps: null, lpFeeBps: null, directions: [] });
    expect(after.probes!.every((p) => !p.executed)).toBe(true);
    expect(after.notes![0]).toBe(
      `upgrade not demonstrated on the fork: proxy.upgradeToAndCall as ${CALLER}: reverted without data or did not change the implementation; proxy.upgradeTo as ${CALLER}: reverted without data or did not change the implementation`,
    );
  });

  it("explains renounced ProxyAdmins and decodes known revert reasons", () => {
    expect(probeOutcome({ method: "ProxyAdmin.owner-renounced", caller: "0x0", executed: false })).toMatch(/ownership is renounced/);
    expect(probeOutcome({ method: "proxy.upgradeToAndCall", caller: "0xd95A", executed: false, revertData: "0x0e5daa94" })).toBe(
      "proxy.upgradeToAndCall as 0xd95A: reverted UpgradesDisabled",
    );
    expect(probeOutcome({ method: "ProxyAdmin.upgradeAndCall", caller: "0x1f22", executed: false, revertData: "0x118cdaa7" + "00".repeat(32) })).toBe(
      "ProxyAdmin.upgradeAndCall as 0x1f22: reverted OwnableUnauthorizedAccount",
    );
  });
});

describe("selectProbeTargets", () => {
  const hook = (address: string, over: Partial<HookRecord> = {}) =>
    ({
      address,
      status: "ok",
      poolIds: [P1, P2],
      worstCase: { level: "swap-100" },
      proxy: { upgradeAuthority: CALLER },
      ...over,
    }) as unknown as HookRecord;
  const pool = (poolId: string, liquidity: string, c0 = ETH) =>
    ({
      poolId,
      hooks: H1,
      currency0: c0,
      currency1: TOK,
      decimals0: 18,
      decimals1: 18,
      fee: 3000,
      isDynamicFee: false,
      tickSpacing: 60,
      state: { sqrtPriceX96: (2n ** 96n).toString(), tick: 0, protocolFee: 0, lpFee: 3000, liquidity },
    }) as unknown as PoolRecord;

  it("picks the deepest priced active pool of each worst-case-100% hook, with its upgrade authority", () => {
    const sel = selectProbeTargets([hook(H1), hook(H2, { worstCase: { level: "code-bound" } as HookRecord["worstCase"] })], [
      pool(P1, "10"),
      pool(P2, "1000000000000000000"),
    ]);
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({ poolId: P2, hooks: H1, authority: CALLER });
  });

  it("skips hooks without a priced pool that has liquidity", () => {
    expect(selectProbeTargets([hook(H1)], [pool(P1, "0"), pool(P2, "5", TOK)])).toEqual([]);
  });
});

describe("supersededByMeasure", () => {
  it("a today re-measure replaces only that pool's today results at that block, never a demonstration", () => {
    const rec = (poolId: string, scenario: string, forkBlock: number, isDemo = false) => ({ poolId, scenario, forkBlock, isDemo }) as never;
    const drop = supersededByMeasure(26347887, new Set([P1]));
    expect(drop(rec(P1, "today", 26347887))).toBe(true);
    expect(drop(rec(P1, "after-admin-upgrade", 26347887))).toBe(false);
    expect(drop(rec(P1, "today", 26000000))).toBe(false);
    expect(drop(rec(P2, "today", 26347887))).toBe(false);
    expect(drop(rec(P1, "today", 26347887, true))).toBe(false);
  });
});
