// HookTax refresh API. Start: `make api` (needs REFRESH_API_TOKEN; MAINNET_RPC_URL optional).
//   POST /refresh {poolId, txHash?}  Authorization: Bearer <REFRESH_API_TOKEN>
//     -> 202 {ok, jobId, poolId, hook, permissionBits, capabilities, worstCase}
//   GET  /jobs/:id                    job progress (index -> simulate -> mirror to Arkiv)
//   GET  /health
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import type { Hex } from "viem";
import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  classifyProxy,
  computeCapabilities,
  decodePermissions,
  permissionBits,
  worstCase,
  type HooksFile,
  type PoolsFile,
  type SimResultsFile,
} from "@hooktax/core";
import {
  REPO_ROOT,
  decodeInitializeLog,
  findInitializeLog,
  hasHook,
  loadRepoEnv,
  mainnetRpcUrls,
  makeMainnetClient,
  refreshPool,
} from "@hooktax/indexer";
import { syncHookAtlas } from "@hooktax/arkiv";
import { createHandler, type Job, type RefreshRequest } from "./app";
import { simulatePool } from "./sim";

loadRepoEnv();
const token = process.env.REFRESH_API_TOKEN?.trim() ?? "";
if (!token) {
  console.error("REFRESH_API_TOKEN is required (generate one with: openssl rand -hex 32)");
  process.exit(1);
}
const port = Number(process.env.API_PORT ?? 8787);
const client = makeMainnetClient(mainnetRpcUrls().urls);
const dataDir = path.join(REPO_ROOT, "data");

async function verify(req: RefreshRequest) {
  const raw = await findInitializeLog(client, req.poolId, req.txHash);
  if (!raw) throw new Error("no Initialize event for this poolId on the PoolManager");
  const pool = decodeInitializeLog(raw);
  if (!hasHook(pool)) throw new Error("pool has no hook");
  const bits = permissionBits(pool.hooks);
  const hook = pool.hooks as Hex;
  const [implementationSlot, adminSlot, beaconSlot] = await Promise.all(
    [EIP1967_IMPLEMENTATION_SLOT, EIP1967_ADMIN_SLOT, EIP1967_BEACON_SLOT].map((slot) =>
      client.getStorageAt({ address: hook, slot }),
    ),
  );
  const proxy = classifyProxy({
    code: null,
    implementationSlot: implementationSlot ?? null,
    adminSlot: adminSlot ?? null,
    beaconSlot: beaconSlot ?? null,
  });
  const input = { permissions: decodePermissions(bits), isUpgradeable: proxy.isUpgradeable, hasDynamicFeePool: pool.isDynamicFee };
  return {
    poolId: pool.poolId,
    hook: pool.hooks,
    permissionBits: bits,
    capabilities: computeCapabilities(input).map((c) => c.id),
    worstCase: worstCase(input).level,
  };
}

const jobs = new Map<string, Job>();
let queue: Promise<void> = Promise.resolve();

function step(job: Job, name: string, status: string, detail?: string) {
  job.steps.push({ step: name, status, ...(detail ? { detail } : {}) });
  console.error(`[job ${job.id.slice(0, 8)}] ${name}: ${status}${detail ? ` (${detail})` : ""}`);
}

async function runJob(job: Job, req: RefreshRequest) {
  job.status = "running";
  const refreshed = await refreshPool(client, { poolId: req.poolId, txHash: req.txHash, dataDir });
  step(job, "index", "ok", `hook ${refreshed.hook.address}, worst case ${refreshed.hook.worstCase.level}`);

  const sim = await simulatePool(req.poolId);
  step(job, "simulate", sim.status, sim.detail);

  if (!process.env.ARKIV_PRIVATE_KEY?.trim()) {
    step(job, "mirror", "skipped", "ARKIV_PRIVATE_KEY not set");
    return;
  }
  const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) as T;
  const simPath = path.join(dataDir, "sim-results.json");
  const summary = await syncHookAtlas({
    mode: "write",
    hooksFile: read<HooksFile>("hooks.json"),
    poolsFile: read<PoolsFile>("pools.json"),
    simFile: existsSync(simPath) ? read<SimResultsFile>("sim-results.json") : undefined,
    targets: ["hooks", "pools", "sims"],
    only: { hooks: [refreshed.hook.address], pools: [refreshed.pool.poolId], sims: sim.simIds },
    accessKey: process.env.ARKIV_ACCESS_KEY?.trim() ?? "",
    privateKey: process.env.ARKIV_PRIVATE_KEY.trim() as Hex,
    maxOps: 20,
    journalFile: path.join(dataDir, "cache", "arkiv-journal.jsonl"),
    log: (m) => console.error(`[job ${job.id.slice(0, 8)}] ${m}`),
  });
  step(job, "mirror", "ok", `${summary.written?.ops ?? 0} Arkiv ops in ${summary.written?.transactions ?? 0} tx`);
}

function enqueue(req: RefreshRequest): Job {
  const job: Job = { id: randomUUID(), poolId: req.poolId, status: "queued", steps: [], createdAt: new Date().toISOString() };
  jobs.set(job.id, job);
  // One job at a time: the Arkiv writer must never send concurrent transactions.
  queue = queue.then(() =>
    runJob(job, req).then(
      () => {
        job.status = "done";
        job.finishedAt = new Date().toISOString();
      },
      (err: unknown) => {
        job.status = "failed";
        job.error = (err instanceof Error ? err.message : String(err)).replace(/https?:\/\/\S+/g, "<url>").slice(0, 300);
        job.finishedAt = new Date().toISOString();
        console.error(`[job ${job.id.slice(0, 8)}] failed: ${job.error}`);
      },
    ),
  );
  return job;
}

createServer(createHandler({ token, verify, enqueue, getJob: (id) => jobs.get(id) })).listen(port, () => {
  console.error(`HookTax API listening on http://localhost:${port} (POST /refresh, GET /jobs/:id, GET /health)`);
});
