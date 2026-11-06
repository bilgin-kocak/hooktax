// `make probe`: M5 on REAL hooks. For every hook whose worst case is 100% of swap value
// (upgradeable AND a swap RETURNS_DELTA bit) that has a priced pool with liquidity, measure today's
// take on a local mainnet fork, impersonate the upgrade authority, try the known upgrade paths, and
// measure again if one executed. Every attempt is recorded; nothing is broadcast.
//   pnpm --filter @hooktax/sim run probe
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatBps, type HookRecord, type HooksFile, type PoolsFile } from "@hooktax/core";
import { DATA, RAW_DIR, SIM_DIR, forkBlock, forkRpc, mergeResults, runForge, setup } from "./common";
import { parseLines, toProbeRecords } from "./parse";
import { probeSelectionLines, selectProbeTargets } from "./select";

async function main() {
  setup();
  const hooksPath = path.join(DATA, "hooks.json");
  const poolsPath = path.join(DATA, "pools.json");
  if (!existsSync(hooksPath) || !existsSync(poolsPath)) throw new Error("run `make index` first (data/hooks.json, data/pools.json)");
  const hooks = (JSON.parse(readFileSync(hooksPath, "utf8")) as HooksFile).hooks;
  const pools = (JSON.parse(readFileSync(poolsPath, "utf8")) as PoolsFile).pools;

  const worst = hooks.filter((h) => h.worstCase.level === "swap-100").length;
  const targets = selectProbeTargets(hooks, pools);
  console.error(`${worst} hooks have a worst case of 100% of swap value; ${targets.length} have a priced pool with liquidity to probe`);
  if (targets.length === 0) return;
  const selFile = path.join(RAW_DIR, "probe-selection.txt");
  writeFileSync(selFile, probeSelectionLines(targets) + "\n");

  const block = await forkBlock();
  const measuredAt = Math.floor(Date.now() / 1000);
  console.error(`probing on a mainnet fork at block ${block} (local fork, nothing broadcast)`);
  const code = await runForge("ProbeUpgrade", {
    MAINNET_FORK_RPC: forkRpc(),
    FORK_BLOCK: String(block),
    HOOKTAX_SELECTION: path.relative(SIM_DIR, selFile),
  });
  if (code !== 0) {
    console.error(`forge test failed (exit ${code})`);
    process.exit(code);
  }

  const run = parseLines(readFileSync(path.join(RAW_DIR, "probe.txt"), "utf8"));
  const records = toProbeRecords(run, {
    forkBlock: block,
    measuredAt,
    hookByPool: new Map(targets.map((t) => [t.poolId.toLowerCase(), t.hooks])),
    ownerByHook: new Map(hooks.map((h: HookRecord) => [h.address.toLowerCase(), h.owner])),
  });
  const ids = new Set(records.map((r) => r.simId));
  mergeResults(records, (r) => ids.has(r.simId));

  let demonstrated = 0;
  for (const r of records.filter((x) => x.scenario === "after-admin-upgrade")) {
    const today = records.find((x) => x.poolId === r.poolId && x.scenario === "today");
    const t = today?.measuredTakeBps != null ? formatBps(today.measuredTakeBps) : today?.status ?? "-";
    if (r.status === "ok") demonstrated++;
    const after = r.status === "ok" && r.measuredTakeBps !== null ? formatBps(r.measuredTakeBps) : "not demonstrated";
    const how = r.probes?.find((p) => p.executed)?.method ?? `tried ${r.probes?.length ?? 0} path(s)`;
    console.error(`  ${r.hook.slice(0, 10)}… pool ${r.poolId.slice(0, 10)}…  today ${t}  ->  ${after}  (${how})`);
  }
  console.error(`worst case demonstrated for ${demonstrated} of ${targets.length} probed hooks; wrote data/sim-results.json; mirror with: make arkiv-sync`);
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
