import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseLines, toSimRecords } from "./parse";

// Real output of `make demo` (SneakyFeeHookDemo on a mainnet fork at block 26348110).
const text = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "demo.txt"), "utf8");

describe("TakeMeter output parsing", () => {
  const run = parseLines(text);

  it("reads the preflight facts", () => {
    expect(run.hook).toMatchObject({ bits: 0x88, forkBlock: 26348110 });
    expect(run.hook!.address.toLowerCase().endsWith("0088")).toBe(true);
    expect(run.upgrades).toHaveLength(1);
  });

  it("builds one record per scenario with both directions", () => {
    const recs = toSimRecords(run, {
      forkBlock: 26348110,
      measuredAt: 1,
      isDemo: true,
      context: () => ({ hook: run.hook!.address, hookOwner: run.hook!.owner }),
    });
    const today = recs.find((r) => r.scenario === "today")!;
    const after = recs.find((r) => r.scenario === "after-admin-upgrade")!;
    expect(today.directions).toHaveLength(2);
    expect(today.measuredTakeBps).toBe(30);
    expect(today.lpFeeBps).toBe(30);
    expect(after.measuredTakeBps).toBe(10_000);
    expect(after.directions.every((d) => d.amountOut === "0")).toBe(true);
    // the fee recipient (the hook owner) is attributed as hook-owner, the PoolManager as pool-manager
    const roles = new Set(today.directions[0]!.flows.map((f) => f.role));
    expect(roles).toEqual(new Set(["pool-manager", "hook-owner", "swapper"]));
    expect(today.simId).toBe(`${today.poolId}:today:26348110`);
  });
});
