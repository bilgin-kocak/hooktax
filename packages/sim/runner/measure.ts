// `make measure` (and the API's per-pool refresh): measured take on real hooked pools, on a fork.
//   pnpm --filter @hooktax/sim run measure                 # top hooks, one pool each
//   pnpm --filter @hooktax/sim run measure --limit 10
//   pnpm --filter @hooktax/sim run measure --pool 0x<id>   # one pool (used by the API)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatBps, type HookRecord, type HooksFile, type PoolRecord, type PoolsFile } from "@hooktax/core";
import { DATA, RAW_DIR, SIM_DIR, forkBlock, forkRpc, mergeResults, runForge, setup } from "./common";
import { parseLines, toSimRecords } from "./parse";
import { selectPools, selectionLines } from "./select";

async function main() {
  setup();
  const { values } = parseArgs({
    options: {
      pool: { type: "string" },
      limit: { type: "string", default: "12" },
      "max-hooks": { type: "string", default: "25" },
      "per-hook": { type: "string", default: "1" },
    },
  });
  const hooksPath = path.join(DATA, "hooks.json");
  const poolsPath = path.join(DATA, "pools.json");
  if (!existsSync(hooksPath) || !existsSync(poolsPath)) throw new Error("run `make index` first (data/hooks.json, data/pools.json)");
  const hooks = (JSON.parse(readFileSync(hooksPath, "utf8")) as HooksFile).hooks;
  const pools = (JSON.parse(readFileSync(poolsPath, "utf8")) as PoolsFile).pools;

  const selection = selectPools(hooks, pools, {
    poolId: values.pool,
    limit: Number(values.limit),
    maxHooks: Number(values["max-hooks"]),
    perHook: Number(values["per-hook"]),
  });
  if (selection.length === 0) {
    console.error(values.pool ? `pool ${values.pool} not found or has no liquidity` : "no active hooked pools to measure");
    process.exit(values.pool ? 1 : 0);
  }
  const selFile = path.join(RAW_DIR, "selection.txt");
  writeFileSync(selFile, selectionLines(selection) + "\n");

  const block = await forkBlock();
  const measuredAt = Math.floor(Date.now() / 1000);
  console.error(`measuring ${selection.length} pool(s) on a mainnet fork at block ${block} (local fork, nothing broadcast)`);
  const code = await runForge("MeasureReal", {
    MAINNET_FORK_RPC: forkRpc(),
    FORK_BLOCK: String(block),
    // forge runs with cwd = packages/sim, so the path must be relative to it.
    HOOKTAX_SELECTION: path.relative(SIM_DIR, selFile),
  });
  if (code !== 0) {
    console.error(`forge test failed (exit ${code})`);
    process.exit(code);
  }

  const run = parseLines(readFileSync(path.join(RAW_DIR, "measure.txt"), "utf8"));
  const ownerByHook = new Map<string, string | null>(hooks.map((h: HookRecord) => [h.address.toLowerCase(), h.owner]));
  const hookByPool = new Map<string, string>(selection.map((s) => [s.poolId.toLowerCase(), s.hooks]));
  const records = toSimRecords(run, {
    forkBlock: block,
    measuredAt,
    isDemo: false,
    context: (poolId) => {
      const hook = hookByPool.get(poolId.toLowerCase()) ?? run.swaps.find((s) => s.poolId === poolId)?.tokenIn ?? "";
      return { hook, hookOwner: ownerByHook.get(hook.toLowerCase()) ?? null };
    },
  });
  // Replace this fork block's non-demo results for the measured pools.
  const measuredPools = new Set(records.map((r) => r.poolId));
  mergeResults(records, (r) => !r.isDemo && r.forkBlock === block && measuredPools.has(r.poolId));

  let ok = 0;
  const statuses: Record<string, number> = {};
  for (const r of records) {
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    if (r.status === "ok") {
      ok++;
      console.error(`  ${r.poolId.slice(0, 12)}… hook ${r.hook.slice(0, 10)}…  take ${formatBps(r.measuredTakeBps ?? 0)}  LP fee ${formatBps(r.lpFeeBps ?? 0)}`);
    }
  }
  console.error(`measured ${records.length} pool-scenario(s): ${ok} ok; statuses ${JSON.stringify(statuses)}`);
  console.error(`wrote data/sim-results.json; mirror with: make arkiv-sync`);
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
