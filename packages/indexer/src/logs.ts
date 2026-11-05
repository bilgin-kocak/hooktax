// Incremental, chunked fetch of PoolManager Initialize logs with an append-only disk cache.
//
// Cache layout (gitignored, under data/cache/):
//   initialize-logs.jsonl   one RawLog per line, appended chunk by chunk
//   initialize-state.json   cursor: last block fully scanned
// A crash between the append and the cursor write can leave duplicate lines. They are
// de-duplicated on read by (transactionHash, logIndex).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseAbiItem, type PublicClient } from "viem";
import {
  INITIALIZE_EVENT_SIGNATURE,
  INITIALIZE_TOPIC0,
  POOL_MANAGER,
  POOL_MANAGER_DEPLOY_BLOCK,
} from "@hooktax/core";
import { errorMessage, isRateLimitError, redact, sleep } from "./util";

export interface RawLog {
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  topics: string[];
  data: string;
}

export interface LogCacheState {
  version: 1;
  poolManager: string;
  topic0: string;
  fromBlock: number;
  lastScannedBlock: number;
}

export type RangeFetcher = (fromBlock: number, toBlock: number) => Promise<RawLog[]>;

export interface ScanOptions {
  from: number;
  to: number;
  /** Starting block span per request. */
  initialSpan: number;
  /** Never request more than this many blocks at once. */
  maxSpan: number;
  fetch: RangeFetcher;
  onChunk: (logs: RawLog[], from: number, to: number) => void | Promise<void>;
  log?: (msg: string) => void;
  wait?: (ms: number) => Promise<void>;
  maxRateLimitRetries?: number;
}

/**
 * Walks [from, to] in chunks. After each success the span doubles (up to a ceiling). After a
 * failure (other than a rate limit) the chunk is retried once, then the span halves and the
 * ceiling drops, so a provider's range limit is learned instead of hammered. Rate limits back off
 * exponentially without shrinking the span.
 */
export async function scanRange(opts: ScanOptions): Promise<{ requests: number; failures: number }> {
  const wait = opts.wait ?? sleep;
  const log = opts.log ?? (() => {});
  const maxRateLimitRetries = opts.maxRateLimitRetries ?? 8;
  let cursor = opts.from;
  let ceiling = Math.max(1, opts.maxSpan);
  let span = Math.max(1, Math.min(opts.initialSpan, ceiling));
  let requests = 0;
  let failures = 0;
  let rateLimitStreak = 0;
  let retriedThisSpan = false;

  while (cursor <= opts.to) {
    const end = Math.min(opts.to, cursor + span - 1);
    requests++;
    try {
      const logs = await opts.fetch(cursor, end);
      await opts.onChunk(logs, cursor, end);
      cursor = end + 1;
      rateLimitStreak = 0;
      retriedThisSpan = false;
      span = Math.min(ceiling, span * 2);
    } catch (err) {
      failures++;
      const msg = redact(errorMessage(err)).slice(0, 200);
      if (isRateLimitError(err) && rateLimitStreak < maxRateLimitRetries) {
        const delay = Math.min(30_000, 1000 * 2 ** rateLimitStreak++);
        log(`rate limited on [${cursor}, ${end}], retrying in ${delay}ms`);
        await wait(delay);
        continue;
      }
      if (!retriedThisSpan) {
        retriedThisSpan = true;
        log(`request failed on [${cursor}, ${end}] (${msg}); retrying once`);
        await wait(500);
        continue;
      }
      if (span === 1) throw new Error(`eth_getLogs failed for block ${cursor}: ${msg}`);
      ceiling = Math.max(1, Math.floor(span / 2));
      span = ceiling;
      retriedThisSpan = false;
      log(`range [${cursor}, ${end}] failed twice (${msg}); span -> ${span}`);
    }
  }
  return { requests, failures };
}

const INITIALIZE_EVENT = parseAbiItem(INITIALIZE_EVENT_SIGNATURE);

export function viemRangeFetcher(client: PublicClient): RangeFetcher {
  return async (fromBlock, toBlock) => {
    const logs = await client.getLogs({
      address: POOL_MANAGER,
      event: INITIALIZE_EVENT,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
    return logs.map((l) => {
      if (l.blockNumber === null || l.transactionHash === null || l.logIndex === null) {
        throw new Error("pending log returned for a finalized range");
      }
      if (l.topics[0]?.toLowerCase() !== INITIALIZE_TOPIC0) {
        throw new Error(`unexpected topic0 ${l.topics[0]}`);
      }
      return {
        blockNumber: Number(l.blockNumber),
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
        topics: [...l.topics],
        data: l.data,
      };
    });
  };
}

export interface SyncOptions {
  cacheDir: string;
  toBlock: number;
  fetch: RangeFetcher;
  initialSpan: number;
  maxSpan: number;
  log?: (msg: string) => void;
}

export interface SyncResult {
  logs: RawLog[];
  scannedFrom: number | null;
  requests: number;
  lastScannedBlock: number;
}

export async function syncInitializeLogs(opts: SyncOptions): Promise<SyncResult> {
  mkdirSync(opts.cacheDir, { recursive: true });
  const logsFile = path.join(opts.cacheDir, "initialize-logs.jsonl");
  const stateFile = path.join(opts.cacheDir, "initialize-state.json");
  const fresh: LogCacheState = {
    version: 1,
    poolManager: POOL_MANAGER,
    topic0: INITIALIZE_TOPIC0,
    fromBlock: POOL_MANAGER_DEPLOY_BLOCK,
    lastScannedBlock: POOL_MANAGER_DEPLOY_BLOCK - 1,
  };

  let state = fresh;
  if (existsSync(stateFile)) {
    const saved = JSON.parse(readFileSync(stateFile, "utf8")) as LogCacheState;
    const compatible =
      saved.version === 1 &&
      saved.poolManager.toLowerCase() === POOL_MANAGER.toLowerCase() &&
      saved.topic0 === INITIALIZE_TOPIC0 &&
      saved.fromBlock === POOL_MANAGER_DEPLOY_BLOCK;
    if (compatible && existsSync(logsFile)) state = saved;
    else opts.log?.("cache is incompatible or incomplete; rescanning from the deploy block");
  }
  if (state === fresh) writeFileSync(logsFile, "");

  let requests = 0;
  let scannedFrom: number | null = null;
  const start = state.lastScannedBlock + 1;
  if (start <= opts.toBlock) {
    scannedFrom = start;
    opts.log?.(`scanning Initialize logs in blocks [${start}, ${opts.toBlock}]`);
    const res = await scanRange({
      from: start,
      to: opts.toBlock,
      initialSpan: opts.initialSpan,
      maxSpan: opts.maxSpan,
      fetch: opts.fetch,
      log: opts.log,
      onChunk: (logs, _from, end) => {
        if (logs.length > 0) appendFileSync(logsFile, logs.map((l) => JSON.stringify(l)).join("\n") + "\n");
        state = { ...state, lastScannedBlock: end };
        writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
        opts.log?.(`  [${_from}, ${end}] +${logs.length} logs`);
      },
    });
    requests = res.requests;
  } else {
    opts.log?.(`cache already covers block ${opts.toBlock} (last scanned ${state.lastScannedBlock})`);
  }

  return {
    logs: readCachedLogs(logsFile).filter((l) => l.blockNumber <= opts.toBlock),
    scannedFrom,
    requests,
    lastScannedBlock: state.lastScannedBlock,
  };
}

export function readCachedLogs(file: string): RawLog[] {
  if (!existsSync(file)) return [];
  const seen = new Set<string>();
  const out: RawLog[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const l = JSON.parse(line) as RawLog;
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}
