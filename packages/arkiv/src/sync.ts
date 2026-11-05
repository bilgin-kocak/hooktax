// HookAtlas -> Arkiv sync. Modes:
//   plan      read-only: what would be created / patched / extended / deleted
//   estimate  plan + unsigned gas estimates for sample batches -> projected tGLM cost (no signing)
//   write     plan + execute (needs a funded ARKIV_PRIVATE_KEY)

import { ExpirationTime } from "@arkiv-network/sdk";
import type { Schema } from "@arkiv-network/sdk/schema";
import { formatEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { HookRecord, HooksFile, PoolRecord, PoolsFile, SimResultsFile } from "@hooktax/core";
import { RABDI_CHAIN_ID, gasPriceOf, makePublicClient, makeWalletClient, type ArkivPublicClient } from "./client";
import { estimateBatch, executeOps, gasFloor, type Op } from "./execute";
import {
  HOOK_OPTIONAL,
  POOL_OPTIONAL,
  hookValues,
  isActivePool,
  poolValues,
  samplePoolIds,
  simResultValues,
} from "./map";
import { planSync, type DesiredEntity, type ExistingEntity, type SyncPlan } from "./plan";
import { readExisting } from "./read";
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
  log: (msg: string) => void;
}

export interface SyncSummary {
  writer: Address | null;
  plans: Record<SyncTarget, { creates: number; patches: number; extensions: number; deletes: number; unchanged: number }>;
  totalOps: number;
  estimate?: { sampleOps: number; sampleGas: string; gasPerOp: string; projectedGas: string; gasPrice: string; projectedCostTGLM: string; balanceTGLM: string | null };
  written?: { transactions: number; ops: number; txHashes: Hex[] };
}

interface Built {
  hookDesired: DesiredEntity<Record<string, unknown>>[];
  poolDesired: DesiredEntity<Record<string, unknown>>[];
  simDesired: DesiredEntity<Record<string, unknown>>[];
}

export function buildDesired(hooksFile: HooksFile, poolsFile: PoolsFile, simFile?: SimResultsFile): Built {
  const poolsById = new Map<string, PoolRecord>(poolsFile.pools.map((p) => [p.poolId, p]));
  const hooksByAddr = new Map<string, HookRecord>(hooksFile.hooks.map((h) => [h.address.toLowerCase(), h]));

  // Latest live (non-demo, ok) take per hook and per pool.
  const nowSec = Math.floor(Date.now() / 1000);
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

  const simDesired = (simFile?.results ?? []).map((r) => {
    const values = simResultValues(r);
    return { id: r.simId.toLowerCase(), values, contentHash: "" };
  });

  return { hookDesired, poolDesired, simDesired };
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
  const currentBlock = await pub.getBlockNumber();
  const existing = async (schema: Schema, idColumn: string, optional: readonly string[], hasHash = true): Promise<ExistingEntity[]> =>
    writer ? readExisting(pub, schema, idColumn, writer, optional, hasHash) : [];

  const ops: Op[] = [];
  const plans = {} as SyncSummary["plans"];
  const empty = { creates: 0, patches: 0, extensions: 0, deletes: 0, unchanged: 0 };
  plans.hooks = plans.pools = plans.sims = empty;

  const planOpts = (optionalColumns: readonly string[]) => ({
    currentBlock,
    extendWithinBlocks: EXTEND_WITHIN_DAYS * BLOCKS_PER_DAY,
    optionalColumns,
  });

  if (opts.targets.includes("hooks")) {
    const ex = await existing(HookSchema, "hook", HOOK_OPTIONAL);
    const plan = planSync(built.hookDesired, ex, planOpts(HOOK_OPTIONAL));
    plans.hooks = summarize(plan);
    ops.push(...planToOps(plan, HookSchema, HOOK_LIFETIME_DAYS));
    log(`hooks: ${built.hookDesired.length} desired, ${ex.length} on Arkiv -> ${JSON.stringify(plans.hooks)}`);
  }
  if (opts.targets.includes("pools")) {
    const ex = await existing(PoolSchema, "poolId", POOL_OPTIONAL);
    const plan = planSync(built.poolDesired, ex, planOpts(POOL_OPTIONAL));
    plans.pools = summarize(plan);
    ops.push(...planToOps(plan, PoolSchema, POOL_LIFETIME_DAYS));
    log(`pools (active only): ${built.poolDesired.length} desired, ${ex.length} on Arkiv -> ${JSON.stringify(plans.pools)}`);
  }
  if (opts.targets.includes("sims")) {
    const ex = await existing(SimResultSchema, "simId", [], false);
    const have = new Set(ex.map((e) => e.id));
    const creates = built.simDesired.filter((d) => !have.has(d.id));
    plans.sims = { ...empty, creates: creates.length, unchanged: built.simDesired.length - creates.length };
    // SimResults are immutable measurements: readonly, never patched, never extended.
    const expiration = ExpirationTime.fromDays(SIM_LIFETIME_DAYS);
    ops.push(...creates.map((c): Op => ({ kind: "create", id: c.id, schema: SimResultSchema, values: c.values, expiration, flags: { readonly: true } })));
    log(`sim results: ${built.simDesired.length} in file, ${ex.length} on Arkiv -> ${creates.length} to create`);
  }

  // One Import entity per run that changes anything: freshness + provenance.
  if (ops.length > 0) {
    const m = opts.hooksFile.meta;
    const values = {
      runId: `${m.toBlock}-${m.generatedAt}`,
      toBlock: BigInt(m.toBlock),
      pools: m.counts.pools,
      hookedPools: m.counts.hookedPools,
      hooks: m.counts.hooks,
      hooksUpgradeable: opts.hooksFile.hooks.filter((h) => h.isUpgradeable).length,
      hooksSwapDelta: opts.hooksFile.hooks.filter((h) => h.canAffectSwapAmounts).length,
      mirroredPools: built.poolDesired.length,
      generatedAt: BigInt(Math.floor(Date.parse(m.generatedAt) / 1000)),
      source: "Ethereum mainnet: Uniswap v4 PoolManager Initialize events + contract state",
      details: new TextEncoder().encode(JSON.stringify({ v: 1, meta: m, targets: opts.targets })),
    };
    const { u64 } = await import("@arkiv-network/sdk/schema");
    ops.push({
      kind: "create",
      id: values.runId,
      schema: ImportSchema,
      values: { ...values, toBlock: u64(values.toBlock), generatedAt: u64(values.generatedAt) },
      expiration: ExpirationTime.max(),
    });
  }

  const selected = opts.limitOps !== undefined ? ops.slice(0, opts.limitOps) : ops;
  const summary: SyncSummary = { writer, plans, totalOps: selected.length };
  log(`total operations: ${selected.length}${opts.limitOps !== undefined ? ` (limited from ${ops.length})` : ""}`);
  if (selected.length === 0 || opts.mode === "plan") return summary;

  if (opts.mode === "estimate") {
    const estimator = writer ?? "0x000000000000000000000000000000000000dEaD";
    const sample = selected.slice(0, Math.min(opts.maxOps, selected.length));
    const est = await estimateBatch(estimator as Address, sample, opts.accessKey);
    const gasPrice = await gasPriceOf(pub);
    const perOp = est.gas / BigInt(sample.length);
    // Charged gas is gas used (~ the estimate), not the gas limit; the floor only sizes the limit.
    const projected = perOp * BigInt(selected.length);
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
  const res = await executeOps(pub, wallet, selected, {
    maxOps: opts.maxOps,
    maxCalldataBytes: 96 * 1024,
    journalFile: opts.journalFile,
    accessKey: opts.accessKey,
    log,
  });
  summary.written = { transactions: res.transactions, ops: res.ops, txHashes: res.txHashes };
  return summary;
}
