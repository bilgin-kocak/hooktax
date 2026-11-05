// Fork simulation step for /refresh. Delegates to the sim runner (packages/sim, M4), which writes
// data/sim-results.json. Returns the SimResult IDs it produced so only those are mirrored.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@hooktax/indexer";
import type { SimResultsFile } from "@hooktax/core";

export interface SimOutcome {
  status: "ok" | "not-run" | "failed";
  detail?: string;
  simIds: string[];
}

const RUNNER = path.join(REPO_ROOT, "packages", "sim", "runner", "measure.ts");

export async function simulatePool(poolId: string): Promise<SimOutcome> {
  if (!existsSync(RUNNER)) return { status: "not-run", detail: "sim runner not installed", simIds: [] };
  const code = await new Promise<number>((resolve) => {
    const child = spawn("pnpm", ["--filter", "@hooktax/sim", "run", "measure", "--pool", poolId], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (c) => resolve(c ?? 1));
  });
  if (code !== 0) return { status: "failed", detail: `sim runner exited with ${code}`, simIds: [] };
  const file = path.join(REPO_ROOT, "data", "sim-results.json");
  if (!existsSync(file)) return { status: "failed", detail: "no sim-results.json written", simIds: [] };
  const results = (JSON.parse(readFileSync(file, "utf8")) as SimResultsFile).results.filter((r) => r.poolId === poolId);
  const latest = Math.max(0, ...results.map((r) => r.forkBlock));
  const simIds = results.filter((r) => r.forkBlock === latest).map((r) => r.simId);
  const ok = results.find((r) => r.forkBlock === latest && r.scenario === "today");
  return { status: "ok", detail: ok ? `${ok.status}, take ${ok.measuredTakeBps ?? "n/a"} bps` : "no result", simIds };
}
