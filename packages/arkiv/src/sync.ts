// HookAtlas -> Arkiv sync. Modes:
//   plan      read-only: what would be created / patched / extended / deleted
//   estimate  plan + unsigned gas estimates for sample batches -> projected tGLM cost (no signing)
//   write     plan + execute (needs a funded ARKIV_PRIVATE_KEY)
//
// Write order (so a short budget buys the most useful data first, see priority.ts):
//   1. SimResults: replaced when re-derived (readonly: delete + create), expiring 7 days after
//      they were MEASURED (not after they were written); expired results are never re-created
//   2. Hooks, riskiest and deepest first (every hook before any pool: the atlas lists all hooks)
//   3. Pools, riskiest and deepest first
//   4. The Import entity (upserted by runId) with the number of pools actually mirrored, paid
//      from the reserve that --reserve keeps back

import { ExpirationTime } from "@arkiv-network/sdk";
import type { Schema } from "@arkiv-network/sdk/schema";
import { formatEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { HookRecord, HooksFile, PoolRecord, PoolsFile, SimResultsFile } from "@hooktax/core";
import { RABDI_CHAIN_ID, gasPriceOf, makePublicClient, makeWalletClient, type ArkivPublicClient } from "./client";
import { estimateBatch, executeOps, gasFloor, type ExecuteResult, type Op } from "./execute";
import {
  HOOK_OPTIONAL,
  POOL_OPTIONAL,
  hookValues,
  isActivePool,
  poolValues,
  samplePoolIds,
  simResultValues,
} from "./map";
import { planImmutable, planSync, type DesiredEntity, type ExistingEntity, type SyncPlan } from "./plan";
import { mirrorPriority } from "./priority";
import { readExisting, readExistingFor } from "./read";
import { HookSchema, ImportSchema, PoolSchema, SimResultSchema } from "./schemas";

/** Arkiv counts lifetimes in 2-second blocks. */
export const BLOCKS_PER_DAY = 43_200n;
export const HOOK_LIFETIME_DAYS = 30;
export const POOL_LIFETIME_DAYS = 30;
/** Spec: SimResult expires after 7 days, so stale safety numbers disappear. */
export const SIM_LIFETIME_DAYS = 7;
export const EXTEND_WITHIN_DAYS = 15n;

export type SyncMode = "plan" | "estimate" | "write";
export type SyncTarget = "hooks" | "pools" | "sims";

export interface SyncOptions {
  mode: SyncMode;
  hooksFile: HooksFile;
  poolsFile: PoolsFile;
  simFile?: SimResultsFile;
  targets: SyncTarget[];
  accessKey: string;
  privateKey?: Hex;
  /** Writer address to plan against when no private key is given. */
  writer?: Address;
  maxOps: number;
  journalFile: string;
  /** Cap the number of operations (for a first small test write). */
  limitOps?: number;
  /** Write mode: stop before the balance would drop below this (wei); the Import is paid from it. */
  reserveWei?: bigint;
  /** Targeted sync (e.g. one refreshed pool): only these natural IDs, looked up one by one. */
  only?: { hooks?: string[]; pools?: string[]; sims?: string[] };
  log: (msg: string) => void;
}

export interface SyncSummary {
  writer: Address | null;
  plans: Record<SyncTarget, { creates: number; patches: number; extensions: number; deletes: number; unchanged: number }>;
  totalOps: number;
  estimate?: { sampleOps: number; sampleGas: string; gasPerOp: string; projectedGas: string; gasPrice: string; projectedCostTGLM: string; balanceTGLM: string | null };
  written?: {
    transactions: number;
    ops: number;
    txHashes: Hex[];
    /** Set when the run stopped early to keep the reserve; re-run after funding to continue. */
    stoppedForBudget?: { balanceTGLM: string; remainingOps: number };
    /** Pools owned by the writer after this run (what the Import entity records). */
    mirroredPools?: number;
  };
}

interface Built {
  hookDesired: DesiredEntity<Record<string, unknown>>[];
  poolDesired: DesiredEntity<Record<string, unknown>>[];
  simDesired: DesiredEntity<Record<string, unknown>>[];
  /** simId -> measuredAt (unix seconds), to anchor each SimResult's expiry to its measurement. */
  simMeasuredAt: Map<string, number>;
}

export function buildDesired(
  hooksFile: HooksFile,
  poolsFile: PoolsFile,
  simFile?: SimResultsFile,
  nowSec = Math.floor(Date.now() / 1000),
): Built {
  const poolsById = new Map<string, PoolRecord>(poolsFile.pools.map((p) => [p.poolId, p]));
  const hooksByAddr = new Map<string, HookRecord>(hooksFile.hooks.map((h) => [h.address.toLowerCase(), h]));

  // Latest live (non-demo, ok) take per hook and per pool.
  const liveSims = (simFile?.results ?? []).filter(
    (r) => !r.isDemo && r.status === "ok" && r.measuredTakeBps !== null && nowSec - r.measuredAt < SIM_LIFETIME_DAYS * 86_400,
  );
  const latestBy = (keyOf: (r: (typeof liveSims)[number]) => string) => {
    const m = new Map<string, (typeof liveSims)[number]>();
    for (const r of liveSims) {
      const k = keyOf(r);
      const prev = m.get(k);
      if (!prev || r.measuredAt > prev.measuredAt) m.set(k, r);
    }
    return m;
  };
  const simByHook = latestBy((r) => r.hook.toLowerCase());
  const simByPool = latestBy((r) => r.poolId.toLowerCase());

  const hookDesired = hooksFile.hooks.map((h) => {
    const active = h.poolIds.filter((id) => {
      const p = poolsById.get(id);
      return p ? isActivePool(p) : false;
    }).length;
    const values = hookValues(h, {
      activePoolCount: active,
      lastMeasuredTakeBps: simByHook.get(h.address.toLowerCase())?.measuredTakeBps ?? undefined,
      samplePoolIds: samplePoolIds(h, poolsById),
    });
    return { id: h.address.toLowerCase(), values, contentHash: values.contentHash as string };
  });

  const poolDesired = poolsFile.pools.filter(isActivePool).map((p) => {
    const hook = hooksByAddr.get(p.hooks.toLowerCase());
    if (!hook) throw new Error(`pool ${p.poolId} references unknown hook ${p.hooks}`);
    const values = poolValues(p, { hook, lastMeasuredTakeBps: simByPool.get(p.poolId)?.measuredTakeBps ?? undefined });
    return { id: p.poolId.toLowerCase(), values, contentHash: values.contentHash as string };
  });

  // Only unexpired measurements: re-creating an old SimResult would resurrect a stale number.
  const unexpired = (simFile?.results ?? []).filter((r) => nowSec - r.measuredAt < SIM_LIFETIME_DAYS * 86_400);
  const simDesired = unexpired.map((r) => {
    const values = simResultValues(r);
    return { id: r.simId.toLowerCase(), values, contentHash: values.contentHash as string };
  });
  const simMeasuredAt = new Map(unexpired.map((r) => [r.simId.toLowerCase(), r.measuredAt]));

  // Mirror order: riskiest and deepest first (priority.ts).
  const pr = mirrorPriority(hooksFile.hooks, poolsFile.pools, simFile?.results ?? []);
  hookDesired.sort((a, b) => pr.compareHooks(a.id, b.id));
  poolDesired.sort((a, b) => pr.comparePools(a.id, b.id));

  return { hookDesired, poolDesired, simDesired, simMeasuredAt };
}

/** Remaining lifetime of a SimResult measured at `measuredAt`, in 2-second Arkiv blocks (min 1h). */
export function simLifetimeBlocks(measuredAt: number, nowSec: number): number {
  const remaining = measuredAt + SIM_LIFETIME_DAYS * 86_400 - nowSec;
  return Math.max(1_800, Math.floor(remaining / 2));
}

function planToOps(
  plan: SyncPlan<Record<string, unknown>>,
  schema: Schema,
  lifetimeDays: number,
  flags?: { readonly?: boolean },
): Op[] {
  const expiration = ExpirationTime.fromDays(lifetimeDays);
  return [
    ...plan.deletes.map((d): Op => ({ kind: "delete", id: d.id, entityKey: d.entityKey })),
    ...plan.creates.map((c): Op => ({ kind: "create", id: c.id, schema, values: c.values, expiration, ...(flags ? { flags } : {}) })),
    ...plan.patches.map((p): Op => ({ kind: "patch", id: p.desired.id, schema, entityKey: p.entityKey, set: p.desired.values, unset: p.unset })),
    ...plan.extensions.map((e): Op => ({ kind: "extend", id: e.id, entityKey: e.entityKey, expiration })),
  ];
}

const summarize = (p: SyncPlan<unknown>) => ({
  creates: p.creates.length,
  patches: p.patches.length,
  extensions: p.extensions.length,
  deletes: p.deletes.length,
  unchanged: p.unchanged,
});

export async function syncHookAtlas(opts: SyncOptions): Promise<SyncSummary> {
  const log = opts.log;
  const pub: ArkivPublicClient = makePublicClient(opts.accessKey);
  const chainId = await pub.getChainId();
  if (chainId !== RABDI_CHAIN_ID) throw new Error(`Arkiv RPC chain id ${chainId}, expected ${RABDI_CHAIN_ID} (Rabdi)`);

  const writer: Address | null = opts.privateKey ? privateKeyToAccount(opts.privateKey).address : (opts.writer ?? null);
  if (opts.mode === "write" && !opts.privateKey) throw new Error("write mode needs ARKIV_PRIVATE_KEY");
  log(`Arkiv Rabdi (chain ${chainId}); writer ${writer ?? "(none: everything is a create)"}`);

  const built = buildDesired(opts.hooksFile, opts.poolsFile, opts.simFile);
  if (opts.only) {
    const keep = (ids: string[] | undefined) => {
      const set = new Set((ids ?? []).map((x) => x.toLowerCase()));
      return (d: { id: string }) => set.has(d.id);
    };
    built.hookDesired = built.hookDesired.filter(keep(opts.only.hooks));
    built.poolDesired = built.poolDesired.filter(keep(opts.only.pools));
    built.simDesired = built.simDesired.filter(keep(opts.only.sims));
  }
  const currentBlock = await pub.getBlockNumber();
  const existing = async (
    schema: Schema,
    idColumn: string,
    optional: readonly string[],
    hasHash = true,
    idType: "addr" | "str" = "str",
    ids?: string[],
  ): Promise<ExistingEntity[]> => {
    if (!writer) return [];
    if (opts.only) return readExistingFor(pub, schema, idColumn, idType, ids ?? [], writer, optional, hasHash);
    return readExisting(pub, schema, idColumn, writer, optional, hasHash);
  };

  const ops: Op[] = [];
  let poolsBefore = 0;
  const plans = {} as SyncSummary["plans"];
  const empty = { creates: 0, patches: 0, extensions: 0, deletes: 0, unchanged: 0 };
  plans.hooks = plans.pools = plans.sims = empty;

  const planOpts = (optionalColumns: readonly string[]) => ({
    currentBlock,
    extendWithinBlocks: EXTEND_WITHIN_DAYS * BLOCKS_PER_DAY,
    optionalColumns,
  });

  if (opts.targets.includes("sims")) {
    const ex = await existing(SimResultSchema, "simId", [], true, "str", built.simDesired.map((d) => d.id));
    const plan = planImmutable(built.simDesired, ex);
    plans.sims = summarize(plan);
    // SimResults are immutable measurements: readonly, never patched, never extended. A changed
    // one is replaced, and every one expires 7 days after it was measured.
    const nowSec = Math.floor(Date.now() / 1000);
    ops.push(
      ...plan.deletes.map((d): Op => ({ kind: "delete", id: d.id, entityKey: d.entityKey })),
      ...plan.creates.map((c): Op => ({
        kind: "create",
        id: c.id,
        schema: SimResultSchema,
        values: c.values,
        expiration: ExpirationTime.fromBlocks(simLifetimeBlocks(built.simMeasuredAt.get(c.id)!, nowSec)),
        flags: { readonly: true },
      })),
    );
    log(`sim results: ${built.simDesired.length} unexpired in file, ${ex.length} on Arkiv -> ${JSON.stringify(plans.sims)}`);
  }

  if (opts.targets.includes("hooks")) {
    const ex = await existing(HookSchema, "hook", HOOK_OPTIONAL, true, "addr", built.hookDesired.map((d) => d.id));
    const plan = planSync(built.hookDesired, ex, planOpts(HOOK_OPTIONAL));
    plans.hooks = summarize(plan);
    ops.push(...planToOps(plan, HookSchema, HOOK_LIFETIME_DAYS));
    log(`hooks: ${built.hookDesired.length} desired, ${ex.length} on Arkiv -> ${JSON.stringify(plans.hooks)}`);
  }
  if (opts.targets.includes("pools")) {
    const ex = await existing(PoolSchema, "poolId", POOL_OPTIONAL, true, "str", built.poolDesired.map((d) => d.id));
    const plan = planSync(built.poolDesired, ex, planOpts(POOL_OPTIONAL));
    plans.pools = summarize(plan);
    poolsBefore = new Set(ex.map((e) => e.id)).size;
    ops.push(...planToOps(plan, PoolSchema, POOL_LIFETIME_DAYS));
    log(`pools (active only): ${built.poolDesired.length} desired, ${ex.length} on Arkiv -> ${JSON.stringify(plans.pools)}`);
  }
  // One Import entity per data snapshot (runId), upserted after the run: freshness + provenance.
  const wantImport = ops.length > 0 && !opts.only;
  const m = opts.hooksFile.meta;
  const runId = `${m.toBlock}-${m.generatedAt}`;
  const importValues = async (mirroredPools: number) => {
    const { u64 } = await import("@arkiv-network/sdk/schema");
    return {
      runId,
      toBlock: u64(BigInt(m.toBlock)),
      pools: m.counts.pools,
      hookedPools: m.counts.hookedPools,
      hooks: m.counts.hooks,
      hooksUpgradeable: opts.hooksFile.hooks.filter((h) => h.isUpgradeable).length,
      hooksSwapDelta: opts.hooksFile.hooks.filter((h) => h.canAffectSwapAmounts).length,
      mirroredPools,
      generatedAt: u64(BigInt(Math.floor(Date.parse(m.generatedAt) / 1000))),
      source: "Ethereum mainnet: Uniswap v4 PoolManager Initialize events + contract state",
      details: new TextEncoder().encode(JSON.stringify({ v: 1, meta: m, targets: opts.targets, activePools: built.poolDesired.length })),
    };
  };
  const importOp = async (mirroredPools: number): Promise<Op> => {
    const values = await importValues(mirroredPools);
    const ex = writer ? await readExistingFor(pub, ImportSchema, "runId", "str", [runId], writer, [], false) : [];
    return ex[0]
      ? { kind: "patch", id: runId, schema: ImportSchema, entityKey: ex[0].entityKey, set: values, unset: [] }
      : { kind: "create", id: runId, schema: ImportSchema, values, expiration: ExpirationTime.max() };
  };

  const selected = opts.limitOps !== undefined ? ops.slice(0, opts.limitOps) : ops;
  const summary: SyncSummary = { writer, plans, totalOps: selected.length + (wantImport ? 1 : 0) };
  log(`total operations: ${summary.totalOps}${opts.limitOps !== undefined ? ` (limited from ${ops.length + (wantImport ? 1 : 0)})` : ""}`);
  if (selected.length === 0 || opts.mode === "plan") return summary;

  if (opts.mode === "estimate") {
    const estimator = writer ?? "0x000000000000000000000000000000000000dEaD";
    // Shrink the sample on failure (an unfunded account's node can reject a large batch estimate,
    // and providers cap calldata) until one succeeds, down to a single op.
    let sampleSize = Math.min(opts.maxOps, selected.length);
    let est: Awaited<ReturnType<typeof estimateBatch>> | undefined;
    let sample = selected.slice(0, sampleSize);
    for (;;) {
      sample = selected.slice(0, sampleSize);
      try {
        est = await estimateBatch(estimator as Address, sample, opts.accessKey);
        break;
      } catch (err) {
        if (sampleSize === 1) throw err;
        sampleSize = Math.max(1, Math.floor(sampleSize / 2));
        log(`  estimate of ${sample.length} ops failed; retrying with ${sampleSize}`);
      }
    }
    const gasPrice = await gasPriceOf(pub);
    const perOp = est.gas / BigInt(sample.length);
    // Charged gas is gas used (~ the estimate), not the gas limit; the floor only sizes the limit.
    const projected = perOp * BigInt(summary.totalOps);
    const balance = writer ? await pub.getBalance({ address: writer }) : null;
    summary.estimate = {
      sampleOps: sample.length,
      sampleGas: est.gas.toString(),
      gasPerOp: perOp.toString(),
      projectedGas: projected.toString(),
      gasPrice: gasPrice.toString(),
      projectedCostTGLM: formatEther(projected * gasPrice),
      balanceTGLM: balance === null ? null : formatEther(balance),
    };
    log(
      `estimate: ${sample.length} ops = ${est.gas} gas (${est.calldataBytes} calldata bytes); ~${perOp} gas/op; ` +
        `projected ${projected} gas x ${gasPrice} wei = ${summary.estimate.projectedCostTGLM} tGLM` +
        (balance !== null ? `; writer balance ${summary.estimate.balanceTGLM} tGLM` : "") +
        `; per-tx gas limit floor ${gasFloor(sample.length)}`,
    );
    return summary;
  }

  const wallet = makeWalletClient(opts.privateKey!, opts.accessKey);
  const exec = (list: readonly Op[], reserveWei?: bigint): Promise<ExecuteResult> =>
    executeOps(pub, wallet, list, {
      maxOps: opts.maxOps,
      maxCalldataBytes: 96 * 1024,
      journalFile: opts.journalFile,
      accessKey: opts.accessKey,
      reserveWei,
      log,
    });
  const res = await exec(selected, opts.reserveWei);
  summary.written = { transactions: res.transactions, ops: res.ops, txHashes: res.txHashes };
  if (res.stoppedForBudget) {
    summary.written.stoppedForBudget = {
      balanceTGLM: formatEther(res.stoppedForBudget.balanceWei),
      remainingOps: selected.length - res.ops,
    };
  }
  if (wantImport && res.ops > 0) {
    const done = selected.slice(0, res.ops);
    // Pool deletes are only duplicates of IDs already counted in poolsBefore (unique IDs).
    const mirroredPools = poolsBefore + done.filter((o) => o.kind === "create" && o.schema === PoolSchema).length;
    const imp = await exec([await importOp(mirroredPools)]);
    summary.written.transactions += imp.transactions;
    summary.written.ops += imp.ops;
    summary.written.txHashes.push(...imp.txHashes);
    summary.written.mirroredPools = mirroredPools;
    log(`import ${runId}: ${mirroredPools} of ${built.poolDesired.length} active pools mirrored`);
  }
  return summary;
}
