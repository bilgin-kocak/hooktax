import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SimResultRecord, SimResultsFile } from "@hooktax/core";
import { PUBLIC_FALLBACK_RPCS, loadRepoEnv, mainnetRpcUrls, makeMainnetClient } from "@hooktax/indexer";

export const SIM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = path.resolve(SIM_DIR, "../..");
export const DATA = path.join(REPO, "data");
export const RAW_DIR = path.join(DATA, "cache", "sim");
export const RESULTS = path.join(DATA, "sim-results.json");

export function setup() {
  loadRepoEnv();
  mkdirSync(RAW_DIR, { recursive: true });
}

/** The fork RPC: MAINNET_RPC_URL if set, else the first keyless public endpoint. Never printed in full. */
export function forkRpc(): string {
  return process.env.MAINNET_RPC_URL?.trim() || PUBLIC_FALLBACK_RPCS[0];
}

/** FORK_BLOCK if set, else the import's snapshot block (so sims match the dataset), else finalized. */
export async function forkBlock(): Promise<number> {
  const env = process.env.FORK_BLOCK?.trim();
  if (env) return Number(env);
  const hooks = path.join(DATA, "hooks.json");
  if (existsSync(hooks)) {
    const head = readFileSync(hooks, "utf8").slice(0, 4096);
    const m = /"snapshotBlock":(\d+)/.exec(head);
    if (m) return Number(m[1]);
  }
  const client = makeMainnetClient(mainnetRpcUrls().urls);
  return Number((await client.getBlock({ blockTag: "finalized" })).number);
}

export function runForge(match: string, env: Record<string, string>): Promise<number> {
  const foundryBin = path.join(process.env.HOME ?? "", ".foundry", "bin");
  return new Promise((resolve) => {
    const child = spawn("forge", ["test", "--match-contract", match, "-vv"], {
      cwd: SIM_DIR,
      env: { ...process.env, ...env, PATH: `${foundryBin}:${process.env.PATH ?? ""}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const keep = (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        // forge's lint notes are noise here; keep results and console logs.
        if (/^\s*(\[PASS\]|\[FAIL|Suite result|Ran \d|Logs:|  \S|Error|Compiler run)/.test(line)) process.stderr.write(line + "\n");
      }
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function readResults(): SimResultsFile {
  if (!existsSync(RESULTS)) return { meta: { schemaVersion: 1, forkBlock: 0, generatedAt: "", source: "", count: 0 }, results: [] };
  return JSON.parse(readFileSync(RESULTS, "utf8")) as SimResultsFile;
}

/** Upsert by simId and write data/sim-results.json. */
export function mergeResults(records: SimResultRecord[], replace: (r: SimResultRecord) => boolean = () => false) {
  const file = readResults();
  const ids = new Set(records.map((r) => r.simId));
  const results = [...file.results.filter((r) => !ids.has(r.simId) && !replace(r)), ...records].sort(
    (a, b) => b.measuredAt - a.measuredAt || a.simId.localeCompare(b.simId),
  );
  const out: SimResultsFile = {
    meta: {
      schemaVersion: 1,
      forkBlock: Math.max(0, ...results.map((r) => r.forkBlock)),
      generatedAt: new Date().toISOString(),
      source: "packages/sim fork simulations (local mainnet fork; nothing broadcast)",
      count: results.length,
    },
    results,
  };
  writeFileSync(RESULTS, JSON.stringify(out, null, 1) + "\n");
  return out;
}
