import { describe, expect, it } from "vitest";
import { planSize, planSync, type DesiredEntity, type ExistingEntity } from "../src/plan";

const d = (id: string, hash: string, values: Record<string, unknown> = { a: 1 }): DesiredEntity<Record<string, unknown>> => ({
  id,
  contentHash: hash,
  values,
});
const e = (id: string, hash: string | null, expiresAt: bigint, key = `0x${id.padStart(64, "0")}`, presentOptional: string[] = []): ExistingEntity => ({
  id,
  entityKey: key as `0x${string}`,
  contentHash: hash,
  expiresAt,
  presentOptional,
});

const opts = { currentBlock: 1_000n, extendWithinBlocks: 500n, optionalColumns: ["owner", "lastMeasuredTakeBps"] };

describe("planSync", () => {
  it("creates missing, patches changed, extends expiring, counts unchanged", () => {
    const plan = planSync(
      [d("1", "h1"), d("2", "h2-new"), d("3", "h3"), d("4", "h4")],
      [e("2", "h2-old", 10_000n), e("3", "h3", 1_200n), e("4", "h4", 10_000n)],
      opts,
    );
    expect(plan.creates.map((c) => c.id)).toEqual(["1"]);
    expect(plan.patches.map((p) => p.desired.id)).toEqual(["2"]);
    expect(plan.extensions.map((x) => x.id)).toEqual(["3"]);
    expect(plan.unchanged).toBe(1);
    expect(planSize(plan)).toBe(3);
  });

  it("deletes duplicates, keeping the longest-lived copy", () => {
    const plan = planSync([d("1", "h1")], [e("1", "h1", 5_000n, "0x01"), e("1", "h1", 9_000n, "0x02")], opts);
    expect(plan.deletes).toEqual([{ entityKey: "0x01", id: "1", reason: "duplicate" }]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("unsets optional columns that disappeared", () => {
    const plan = planSync(
      [d("1", "new", { a: 1, owner: "x" })],
      [e("1", "old", 9_000n, "0x01", ["owner", "lastMeasuredTakeBps"])],
      opts,
    );
    expect(plan.patches[0]!.unset).toEqual(["lastMeasuredTakeBps"]);
  });

  it("a changed and expiring entity gets both a patch and an extension", () => {
    const plan = planSync([d("1", "new")], [e("1", "old", 1_100n)], opts);
    expect(plan.patches).toHaveLength(1);
    expect(plan.extensions).toHaveLength(1);
    expect(plan.unchanged).toBe(0);
  });

  it("rejects duplicate desired ids", () => {
    expect(() => planSync([d("1", "a"), d("1", "b")], [], opts)).toThrow(/duplicate/);
  });
});
