// Refresh one pool (and its hook) from mainnet, for the API's POST /refresh (called by the CRE
// workflow). Never trusts the caller: the Initialize event is re-read from chain, either from the
// given transaction's receipt or by its indexed poolId.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseAbiItem, type Hex, type PublicClient } from "viem";
import {
  INITIALIZE_EVENT_SIGNATURE,
  INITIALIZE_TOPIC0,
  POOL_MANAGER,
  POOL_MANAGER_DEPLOY_BLOCK,
  type HookRecord,
  type HooksFile,
  type PoolRecord,
  type PoolsFile,
} from "@hooktax/core";
import { buildHookRecord, buildPoolRecord, sortHooks, sortPools } from "./build";
import { readHookFacts, readPoolStates, readTokenMeta } from "./enrich";
import type { RawLog } from "./logs";
import { writeDataset } from "./output";
import { decodeInitializeLog, hasHook, type DecodedPool } from "./pools";

const INITIALIZE_EVENT = parseAbiItem(INITIALIZE_EVENT_SIGNATURE);
const POOL_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export async function findInitializeLog(
  client: PublicClient,
  poolId: string,
  txHash?: string,
): Promise<RawLog | null> {
  if (!POOL_ID_RE.test(poolId)) throw new Error("poolId must be 32-byte hex");
  const id = poolId.toLowerCase();
  if (txHash) {
    if (!POOL_ID_RE.test(txHash)) throw new Error("txHash must be 32-byte hex");
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    const log = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === POOL_MANAGER.toLowerCase() &&
        l.topics[0]?.toLowerCase() === INITIALIZE_TOPIC0 &&
        l.topics[1]?.toLowerCase() === id,
    );
    if (!log) return null;
    return { blockNumber: Number(log.blockNumber), transactionHash: log.transactionHash, logIndex: log.logIndex, topics: [...log.topics], data: log.data };
  }
  // poolId is an indexed topic, so one wide filtered query finds it.
  const logs = await client.getLogs({
    address: POOL_MANAGER,
    event: INITIALIZE_EVENT,
    args: { id: id as Hex },
    fromBlock: BigInt(POOL_MANAGER_DEPLOY_BLOCK),
    toBlock: "latest",
  });
  const l = logs[0];
  if (!l || l.blockNumber === null || l.transactionHash === null || l.logIndex === null) return null;
  return { blockNumber: Number(l.blockNumber), transactionHash: l.transactionHash, logIndex: l.logIndex, topics: [...l.topics], data: l.data };
}

export interface RefreshResult {
  pool: PoolRecord;
  hook: HookRecord;
  snapshotBlock: number;
}

/** Re-read one hooked pool and its hook at the latest finalized block and upsert both datasets. */
export async function refreshPool(
  client: PublicClient,
  opts: { poolId: string; txHash?: string; dataDir: string; log?: (m: string) => void },
): Promise<RefreshResult> {
  const log = opts.log ?? (() => {});
  const raw = await findInitializeLog(client, opts.poolId, opts.txHash);
  if (!raw) throw new Error(`no Initialize event for pool ${opts.poolId} on the PoolManager`);
  const decoded = decodeInitializeLog(raw);
  if (!hasHook(decoded)) throw new Error(`pool ${decoded.poolId} has no hook`);

  const hooksPath = path.join(opts.dataDir, "hooks.json");
  const poolsPath = path.join(opts.dataDir, "pools.json");
  const hooksFile = existsSync(hooksPath) ? (JSON.parse(readFileSync(hooksPath, "utf8")) as HooksFile) : null;
  const poolsFile = existsSync(poolsPath) ? (JSON.parse(readFileSync(poolsPath, "utf8")) as PoolsFile) : null;

  const finalized = Number((await client.getBlock({ blockTag: "finalized" })).number);
  const snapshot = BigInt(Math.max(finalized, decoded.blockNumber));

  // All known pools of this hook (from the dataset) plus the new one.
  const known: DecodedPool[] = (poolsFile?.pools ?? [])
    .filter((p) => p.hooks.toLowerCase() === decoded.hooks.toLowerCase() && p.poolId !== decoded.poolId)
    .map((p) => ({
      poolId: p.poolId,
      currency0: p.currency0,
      currency1: p.currency1,
      fee: p.fee,
      isDynamicFee: p.isDynamicFee,
      tickSpacing: p.tickSpacing,
      hooks: p.hooks,
      sqrtPriceX96: p.initSqrtPriceX96,
      tick: p.initTick,
      blockNumber: p.blockNumber,
      transactionHash: p.transactionHash,
      logIndex: p.logIndex,
    }));
  const pools = [...known, decoded].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const group = {
    hook: decoded.hooks,
    pools,
    firstSeenBlock: pools[0]!.blockNumber,
    dynamicFeePoolCount: pools.filter((p) => p.isDynamicFee).length,
  };

  log(`refreshing hook ${decoded.hooks} (${pools.length} pools) at block ${snapshot}`);
  const facts = await readHookFacts(client, [decoded.hooks], snapshot);
  const states = await readPoolStates(client, [decoded.poolId], snapshot);
  const tokens = await readTokenMeta(client, [decoded.currency0, decoded.currency1], snapshot);
  const hook = buildHookRecord(group, facts.get(decoded.hooks)!);
  const pool = buildPoolRecord(decoded, states.get(decoded.poolId) ?? null, tokens);

  if (hooksFile && poolsFile) {
    const hooks = sortHooks([...hooksFile.hooks.filter((h) => h.address.toLowerCase() !== hook.address.toLowerCase()), hook]);
    const allPools = sortPools([...poolsFile.pools.filter((p) => p.poolId !== pool.poolId), pool]);
    const isNewPool = !poolsFile.pools.some((p) => p.poolId === pool.poolId);
    const isNewHook = !hooksFile.hooks.some((h) => h.address.toLowerCase() === hook.address.toLowerCase());
    const meta = {
      ...hooksFile.meta,
      toBlock: Math.max(hooksFile.meta.toBlock, decoded.blockNumber),
      generatedAt: new Date().toISOString(),
      counts: {
        ...hooksFile.meta.counts,
        pools: hooksFile.meta.counts.pools + (isNewPool ? 1 : 0),
        hookedPools: hooksFile.meta.counts.hookedPools + (isNewPool ? 1 : 0),
        hooks: hooks.length,
        hooksWithCode: hooks.filter((h) => h.status === "ok").length,
      },
    };
    void isNewHook;
    writeDataset(hooksPath, meta, "hooks", hooks);
    writeDataset(poolsPath, meta, "pools", allPools);
  }
  return { pool, hook, snapshotBlock: Number(snapshot) };
}
