#!/usr/bin/env -S tsx
// hooktax check <poolId|hookAddress>   plain-English HookTax card from the local dataset
// hooktax atlas                        one-line summary of the imported dataset
//
// Reads data/hooks.json, data/pools.json, data/sim-results.json. The same data lives on Arkiv;
// each card prints the arkiv_query that fetches it there.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { HooksFile, PoolsFile, SimResultsFile } from "@hooktax/core";
import { arkivQueryFor, check, classifyTarget, type Dataset } from "./lookup";
import { renderCard } from "./render";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function loadDataset(dir: string): Dataset {
  const read = <T>(f: string, fallback: T): T => {
    const p = path.join(dir, f);
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
  };
  const hooksFile = read<HooksFile | null>("hooks.json", null);
  const poolsFile = read<PoolsFile | null>("pools.json", null);
  if (!hooksFile || !poolsFile) throw new Error(`no dataset in ${dir} (run \`make index\` first)`);
  const sims = read<SimResultsFile>("sim-results.json", { meta: { schemaVersion: 1, forkBlock: 0, generatedAt: "", source: "", count: 0 }, results: [] });
  return { hooks: hooksFile.hooks, pools: poolsFile.pools, sims: sims.results, snapshotBlock: hooksFile.meta.snapshotBlock };
}

function usage(): never {
  console.error("usage:\n  hooktax check <poolId|hookAddress>\n  hooktax atlas");
  process.exit(2);
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { data: { type: "string", default: path.join(REPO_ROOT, "data") }, json: { type: "boolean", default: false } },
  });
  const [cmd, arg] = positionals;
  if (!cmd) usage();
  const data = loadDataset(values.data!);

  if (cmd === "atlas") {
    const up = data.hooks.filter((h) => h.isUpgradeable).length;
    const sd = data.hooks.filter((h) => h.canAffectSwapAmounts).length;
    const ws = data.hooks.filter((h) => h.worstCase.level === "swap-100").length;
    const measured = new Set(data.sims.filter((s) => !s.isDemo && s.status === "ok").map((s) => s.hook.toLowerCase())).size;
    if (values.json) {
      console.log(JSON.stringify({ snapshotBlock: data.snapshotBlock, hooks: data.hooks.length, pools: data.pools.length, upgradeable: up, canAffectSwapAmounts: sd, worstCaseSwap100: ws, hooksMeasured: measured }, null, 2));
    } else {
      console.log(`HookAtlas @ block ${data.snapshotBlock}: ${data.hooks.length} hooks, ${data.pools.length} hooked pools`);
      console.log(`  ${up} upgradeable · ${sd} can change swap amounts · ${ws} worst case 100% of swap value · ${measured} measured on a fork`);
    }
    return;
  }

  if (cmd !== "check" || !arg) usage();
  const res = check(classifyTarget(arg), data);
  if ("error" in res) {
    console.error(`error: ${res.error}`);
    process.exit(1);
  }
  const writer = process.env.VITE_ARKIV_WRITER_ADDRESS?.trim() || process.env.ARKIV_WRITER_ADDRESS?.trim() || "0x<writer>";
  if (values.json) {
    console.log(JSON.stringify({ hook: res.hook, pool: res.pool, card: res.card, today: res.today, demonstrations: res.demonstrations }, null, 2));
    return;
  }
  console.log(renderCard(res, { snapshotBlock: data.snapshotBlock, arkivQuery: arkivQueryFor(res.hook, writer), writerKnown: writer !== "0x<writer>" }));
}

try {
  main();
} catch (err) {
  console.error(`error: ${(err instanceof Error ? err.message : String(err)).replace(/https?:\/\/\S+/g, "<url>")}`);
  process.exit(1);
}
