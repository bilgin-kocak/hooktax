import { describe, expect, it } from "vitest";
import { nextFittingBatch, type Op } from "../src/execute";

const ops: Op[] = Array.from({ length: 20 }, (_, i) => ({ kind: "delete", id: String(i), entityKey: "0x01" }));
const base = { maxOps: 20, maxCalldataBytes: 96 * 1024, journalFile: "/dev/null", log: () => {} };
const W = "0x000000000000000000000000000000000000dEaD" as const;

describe("nextFittingBatch", () => {
  it("halves the batch when the node rejects the estimate itself (e.g. calldata over its 128 KiB cap)", async () => {
    const seen: number[] = [];
    const estimate = async (_w: unknown, batch: readonly Op[]) => {
      seen.push(batch.length);
      if (batch.length * 6_700 > 128 * 1024) throw new Error("unsigned estimate failed: Execution error without revert data");
      return { gas: 500_000n * BigInt(batch.length), calldataBytes: batch.length * 6_700 };
    };
    const r = await nextFittingBatch(W, ops, 0, base, 60_000_000n, estimate);
    expect(seen).toEqual([20, 10]);
    expect(r.batch).toHaveLength(10);
  });

  it("shrinks proportionally to its own calldata limit after a successful estimate (not by half)", async () => {
    const estimate = async (_w: unknown, batch: readonly Op[]) => ({ gas: 1n, calldataBytes: batch.length * 6_700 });
    const r = await nextFittingBatch(W, ops, 0, { ...base, maxOps: 16 }, 60_000_000n, estimate);
    // 16 x 6,700 = 107 KB > 96 KiB; 14 x 6,700 = 93.8 KB fits.
    expect(r.batch).toHaveLength(14);
  });

  it("rethrows when a single operation cannot be estimated", async () => {
    const estimate = async () => {
      throw new Error("boom");
    };
    await expect(nextFittingBatch(W, ops, 0, base, 60_000_000n, estimate)).rejects.toThrow(/boom/);
  });
});
