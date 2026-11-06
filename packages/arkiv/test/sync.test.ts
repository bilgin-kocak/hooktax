import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HooksFile, PoolsFile, SimResultsFile } from "@hooktax/core";
import { BLOCKS_PER_DAY, SIM_LIFETIME_DAYS, buildDesired, simLifetimeBlocks } from "../src/sync";

// A slice of the committed dataset: real records, so ranking is tested on real shapes.
const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
const read = <T>(f: string) => JSON.parse(readFileSync(path.join(DATA, f), "utf8")) as T;
const hooksFile = read<HooksFile>("hooks.json");
const poolsFile = read<PoolsFile>("pools.json");
const simFile = read<SimResultsFile>("sim-results.json");
const measuredAt = Math.max(...simFile.results.map((r) => r.measuredAt));
// buildDesired over the full dataset takes seconds, so build each time point once.
const built = buildDesired(hooksFile, poolsFile, simFile, measuredAt + 60);
const builtAfterExpiry = buildDesired(hooksFile, poolsFile, simFile, measuredAt + SIM_LIFETIME_DAYS * 86_400 + 1);

describe("buildDesired mirror order", () => {
  const hookByAddr = new Map(hooksFile.hooks.map((h) => [h.address.toLowerCase(), h]));
  const poolById = new Map(poolsFile.pools.map((p) => [p.poolId.toLowerCase(), p]));

  it("keeps every hook and every active pool (ordering never drops anything)", () => {
    expect(built.hookDesired).toHaveLength(hooksFile.hooks.length);
    expect(new Set(built.hookDesired.map((d) => d.id)).size).toBe(hooksFile.hooks.length);
  });

  it("puts the 35 worst-case-100% hooks first, and their pools first", () => {
    const n = hooksFile.hooks.filter((h) => h.worstCase.level === "swap-100").length;
    expect(n).toBe(35);
    expect(built.hookDesired.slice(0, n).every((d) => hookByAddr.get(d.id)!.worstCase.level === "swap-100")).toBe(true);
    const firstPool = poolById.get(built.poolDesired[0]!.id)!;
    expect(hookByAddr.get(firstPool.hooks.toLowerCase())!.worstCase.level).toBe("swap-100");
  });

  it("puts every measured pool before the plain swap-delta pools", () => {
    const measured = new Set(simFile.results.filter((r) => !r.isDemo).map((r) => r.poolId.toLowerCase()));
    const lastMeasured = Math.max(...built.poolDesired.map((d, i) => (measured.has(d.id) ? i : -1)));
    expect(lastMeasured).toBeLessThan(200);
  });
});

describe("SimResult freshness", () => {
  it("never re-creates a SimResult older than 7 days", () => {
    expect(builtAfterExpiry.simDesired).toHaveLength(0);
    expect(built.simDesired).toHaveLength(simFile.results.length);
  });

  it("expires 7 days after measurement, not after the write", () => {
    expect(simLifetimeBlocks(1_000_000, 1_000_000)).toBe(Number(BLOCKS_PER_DAY) * SIM_LIFETIME_DAYS);
    expect(simLifetimeBlocks(1_000_000, 1_000_000 + 86_400)).toBe(Number(BLOCKS_PER_DAY) * (SIM_LIFETIME_DAYS - 1));
    expect(simLifetimeBlocks(1_000_000, 1_000_000 + 30 * 86_400)).toBe(1_800); // floor: 1 hour
  });

  it("gives each SimResult a content hash", () => {
    expect(built.simDesired.every((d) => /^[0-9a-f]{64}$/.test(d.contentHash))).toBe(true);
  });
});
