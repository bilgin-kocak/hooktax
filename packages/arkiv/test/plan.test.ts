import { describe, expect, it } from "vitest";
import { planImmutable, planSize, planSync, type DesiredEntity, type ExistingEntity } from "../src/plan";

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

describe("planImmutable (readonly SimResults)", () => {
  it("creates missing, replaces changed or hash-less ones (delete + create), keeps identical", () => {
    const plan = planImmutable(
      [d("new", "h1"), d("same", "h2"), d("changed", "h3-new"), d("legacy", "h4")],
      [e("same", "h2", 10_000n), e("changed", "h3-old", 10_000n), e("legacy", null, 10_000n)],
    );
    expect(plan.creates.map((c) => c.id)).toEqual(["new", "changed", "legacy"]);
    expect(plan.deletes.map((x) => [x.id, x.reason])).toEqual([
      ["changed", "replaced"],
      ["legacy", "replaced"],
    ]);
    expect(plan.unchanged).toBe(1);
  });

  it("deletes duplicates, keeping the longest-lived copy when it is current", () => {
    const plan = planImmutable([d("x", "h")], [e("x", "h", 5_000n, "0x01"), e("x", "h", 9_000n, "0x02")]);
    expect(plan.deletes).toEqual([{ entityKey: "0x01", id: "x", reason: "duplicate" }]);
    expect(plan.creates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("never touches entities that are not desired (e.g. results outside the current file)", () => {
    const plan = planImmutable([], [e("old", "h", 10_000n)]);
    expect(planSize(plan)).toBe(0);
  });
});
