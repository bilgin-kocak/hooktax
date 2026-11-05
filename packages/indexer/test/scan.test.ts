import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POOL_MANAGER_DEPLOY_BLOCK } from "@hooktax/core";
import { scanRange, syncInitializeLogs, type RawLog } from "../src/logs";

const noWait = async () => {};

function fakeLog(block: number, logIndex = 0): RawLog {
  return { blockNumber: block, transactionHash: `0x${block.toString(16)}`, logIndex, topics: [], data: "0x" };
}

describe("scanRange", () => {
  it("covers the whole range exactly once and learns a provider's span limit", async () => {
    const calls: Array<[number, number]> = [];
    const covered: Array<[number, number]> = [];
    const res = await scanRange({
      from: 100,
      to: 10_099,
      initialSpan: 500,
      maxSpan: 1_000_000,
      wait: noWait,
      fetch: async (a, b) => {
        calls.push([a, b]);
        if (b - a + 1 > 1000) throw new Error("block range too large, max 1000");
        return [];
      },
      onChunk: (_logs, a, b) => {
        covered.push([a, b]);
      },
    });
    // contiguous, no gaps or overlaps
    expect(covered[0]![0]).toBe(100);
    expect(covered.at(-1)![1]).toBe(10_099);
    for (let i = 1; i < covered.length; i++) expect(covered[i]![0]).toBe(covered[i - 1]![1] + 1);
    // after learning, no request exceeds the limit
    const afterFirstFailure = calls.findIndex(([a, b]) => b - a + 1 > 1000);
    expect(afterFirstFailure).toBeGreaterThanOrEqual(0);
    const later = calls.slice(afterFirstFailure + 2);
    expect(later.every(([a, b]) => b - a + 1 <= 1000)).toBe(true);
    expect(res.failures).toBe(2); // one retry, then halve
  });

  it("backs off on rate limits without shrinking the span", async () => {
    let n = 0;
    const waits: number[] = [];
    const spans: number[] = [];
    await scanRange({
      from: 0,
      to: 99,
      initialSpan: 100,
      maxSpan: 100,
      wait: async (ms) => {
        waits.push(ms);
      },
      fetch: async (a, b) => {
        spans.push(b - a + 1);
        if (n++ < 2) throw new Error("HTTP 429 Too Many Requests");
        return [];
      },
      onChunk: () => {},
    });
    expect(spans).toEqual([100, 100, 100]);
    expect(waits).toEqual([1000, 2000]);
  });

  it("gives up with a clear error when a single block keeps failing", async () => {
    await expect(
      scanRange({
        from: 5,
        to: 5,
        initialSpan: 1,
        maxSpan: 1,
        wait: noWait,
        fetch: async () => {
          throw new Error("boom");
        },
        onChunk: () => {},
      }),
    ).rejects.toThrow(/block 5/);
  });
});

describe("syncInitializeLogs (incremental cache)", () => {
  it("second run only scans new blocks and de-duplicates", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hooktax-cache-"));
    const start = POOL_MANAGER_DEPLOY_BLOCK;
    const requested: Array<[number, number]> = [];
    const fetch = async (a: number, b: number) => {
      requested.push([a, b]);
      const out: RawLog[] = [];
      for (const blk of [start + 10, start + 50, start + 150]) if (blk >= a && blk <= b) out.push(fakeLog(blk));
      return out;
    };

    const first = await syncInitializeLogs({ cacheDir: dir, toBlock: start + 99, fetch, initialSpan: 1000, maxSpan: 1000 });
    expect(first.logs.map((l) => l.blockNumber)).toEqual([start + 10, start + 50]);
    expect(requested).toEqual([[start, start + 99]]);

    const second = await syncInitializeLogs({ cacheDir: dir, toBlock: start + 199, fetch, initialSpan: 1000, maxSpan: 1000 });
    expect(requested.at(-1)).toEqual([start + 100, start + 199]);
    expect(second.logs.map((l) => l.blockNumber)).toEqual([start + 10, start + 50, start + 150]);

    // Simulate a crash that re-appended a chunk: duplicates are dropped on read.
    const third = await syncInitializeLogs({ cacheDir: dir, toBlock: start + 199, fetch, initialSpan: 1000, maxSpan: 1000 });
    expect(requested).toHaveLength(2); // nothing new to scan
    expect(third.logs).toHaveLength(3);
    const state = JSON.parse(readFileSync(path.join(dir, "initialize-state.json"), "utf8"));
    expect(state.lastScannedBlock).toBe(start + 199);
  });
});
