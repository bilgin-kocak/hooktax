// Usage (from the repo root):
//   make arkiv-plan       pnpm --filter @hooktax/arkiv sync --plan
//   make arkiv-estimate   pnpm --filter @hooktax/arkiv sync --estimate
//   make arkiv-sync       pnpm --filter @hooktax/arkiv sync --write
// Options: --only hooks,pools,sims   --max-ops 20   --limit 5 (first N ops only, for a smoke write)
//          --reserve 0.2 (tGLM to keep back: a write stops cleanly before going below it, then
//          records the Import from it; re-run after funding to continue where it stopped)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseEther, type Address, type Hex } from "viem";
import type { HooksFile, PoolsFile, SimResultsFile } from "@hooktax/core";
import { RABDI_EXPLORER, redactArkiv } from "./client";
import { syncHookAtlas, type SyncMode, type SyncTarget } from "./sync";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function loadEnv() {
  const file = path.join(REPO_ROOT, ".env");
  if (!existsSync(file)) return;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [k, v] of Object.entries(before)) if (v !== undefined) process.env[k] = v;
}

async function main() {
  loadEnv();
  const { values } = parseArgs({
    options: {
      plan: { type: "boolean", default: false },
      estimate: { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      only: { type: "string", default: "hooks,pools,sims" },
      "max-ops": { type: "string", default: "20" },
      limit: { type: "string" },
      reserve: { type: "string", default: "0.2" },
      data: { type: "string", default: path.join(REPO_ROOT, "data") },
    },
  });
  const mode: SyncMode = values.write ? "write" : values.estimate ? "estimate" : "plan";
  const targets = values.only!.split(",").map((s) => s.trim()) as SyncTarget[];
  for (const t of targets) if (!["hooks", "pools", "sims"].includes(t)) throw new Error(`unknown target ${t}`);

  const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(values.data!, f), "utf8")) as T;
  const simPath = path.join(values.data!, "sim-results.json");
  const privateKey = process.env.ARKIV_PRIVATE_KEY?.trim() as Hex | undefined;
  const writerEnv = process.env.VITE_ARKIV_WRITER_ADDRESS?.trim() || process.env.ARKIV_WRITER_ADDRESS?.trim();

  const summary = await syncHookAtlas({
    mode,
    hooksFile: read<HooksFile>("hooks.json"),
    poolsFile: read<PoolsFile>("pools.json"),
    simFile: existsSync(simPath) ? read<SimResultsFile>("sim-results.json") : undefined,
    targets,
    accessKey: process.env.ARKIV_ACCESS_KEY?.trim() ?? "",
    privateKey: privateKey || undefined,
    writer: (writerEnv as Address | undefined) || undefined,
    maxOps: Number(values["max-ops"]),
    limitOps: values.limit ? Number(values.limit) : undefined,
    reserveWei: parseEther(values.reserve!),
    journalFile: path.join(values.data!, "cache", "arkiv-journal.jsonl"),
    log: (m) => console.error(m),
  });
  console.log(JSON.stringify(summary, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  if (summary.written?.txHashes.length) {
    console.error(`explorer: ${RABDI_EXPLORER}/tx/${summary.written.txHashes.at(-1)}`);
  }
  if (summary.written?.stoppedForBudget) {
    const b = summary.written.stoppedForBudget;
    console.error(`stopped to keep the ${values.reserve} tGLM reserve (balance ${b.balanceTGLM}); ${b.remainingOps} ops left: fund the writer and re-run to continue`);
  }
}

main().catch((err) => {
  console.error(redactArkiv(err instanceof Error ? (err.stack ?? err.message) : String(err)));
  process.exit(1);
});
