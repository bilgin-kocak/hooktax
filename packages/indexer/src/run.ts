import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CHAIN_ID,
  POOL_MANAGER,
  POOL_MANAGER_DEPLOY_BLOCK,
  type DatasetMeta,
  type HooksFile,
  type PoolsFile,
} from "@hooktax/core";
import { buildHookRecord, buildPoolRecord, sortHooks, sortPools } from "./build";
import { readHookFacts, readPoolStates, readTokenMeta } from "./enrich";
import { intEnv } from "./env";
import { syncInitializeLogs, viemRangeFetcher } from "./logs";
import { decodeInitializeLog, groupByHook, hasHook } from "./pools";
import { mainnetRpcUrls, makeMainnetClient, rpcHost } from "./rpc";

export interface IndexerOptions {
  /** Last block to scan and the snapshot block for state reads. Default: the finalized block. */
  toBlock?: number;
  outDir: string;
  cacheDir: string;
  log?: (msg: string) => void;
}

export interface IndexerResult {
  hooksFile: HooksFile;
  poolsFile: PoolsFile;
  hooksPath: string;
  poolsPath: string;
}

export async function runIndexer(opts: IndexerOptions): Promise<IndexerResult> {
  const log = opts.log ?? ((m: string) => console.error(m));
  const { urls, usingPublicFallback } = mainnetRpcUrls();
  const hosts = urls.map(rpcHost);
  log(
    usingPublicFallback
      ? `MAINNET_RPC_URL not set: using public read-only RPCs (${hosts.join(", ")})`
      : `RPC: ${hosts[0]} (fallbacks: ${hosts.slice(1).join(", ")})`,
  );
  const client = makeMainnetClient(urls);

  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) throw new Error(`RPC returned chain id ${chainId}; expected ${CHAIN_ID} (mainnet)`);

  const toBlock = opts.toBlock ?? Number((await client.getBlock({ blockTag: "finalized" })).number);
  if (toBlock < POOL_MANAGER_DEPLOY_BLOCK) throw new Error(`toBlock ${toBlock} is before the PoolManager deployment`);

  const sync = await syncInitializeLogs({
    cacheDir: opts.cacheDir,
    toBlock,
    fetch: viemRangeFetcher(client),
    initialSpan: intEnv("MAINNET_LOGS_BLOCK_RANGE", 10_000),
    maxSpan: intEnv("MAINNET_LOGS_MAX_BLOCK_RANGE", 1_000_000),
    log,
  });

  const decoded = sync.logs.map(decodeInitializeLog);
  const hooked = decoded.filter(hasHook);
  const groups = groupByHook(hooked);
  log(`decoded ${decoded.length} pools: ${hooked.length} with a hook, ${groups.length} unique hooks`);

  const snapshot = BigInt(toBlock);
  let t = Date.now();
  const lap = () => `${((Date.now() - t) / 1000).toFixed(1)}s`;
  log(`reading hook facts at block ${toBlock}`);
  const facts = await readHookFacts(client, groups.map((g) => g.hook), snapshot, log);
  log(`  hook facts took ${lap()}`);
  t = Date.now();
  log(`reading pool state for ${hooked.length} hooked pools`);
  const states = await readPoolStates(client, hooked.map((p) => p.poolId), snapshot, log);
  log(`  pool states took ${lap()}`);
  t = Date.now();
  const tokenList = [...new Set(hooked.flatMap((p) => [p.currency0, p.currency1]))];
  log(`reading token metadata for ${tokenList.length} currencies`);
  const tokens = await readTokenMeta(client, tokenList, snapshot, log);
  log(`  token metadata took ${lap()}`);

  const hooks = sortHooks(groups.map((g) => buildHookRecord(g, facts.get(g.hook)!)));
  const pools = sortPools(hooked.map((p) => buildPoolRecord(p, states.get(p.poolId) ?? null, tokens)));

  const meta: DatasetMeta = {
    schemaVersion: 1,
    chainId: 1,
    poolManager: POOL_MANAGER,
    fromBlock: POOL_MANAGER_DEPLOY_BLOCK,
    toBlock,
    snapshotBlock: toBlock,
    generatedAt: new Date().toISOString(),
    source:
      "Ethereum mainnet JSON-RPC: Uniswap v4 PoolManager Initialize events, contract code, storage slots and view calls (public onchain data)",
    rpcHosts: hosts,
    counts: {
      pools: decoded.length,
      hookedPools: hooked.length,
      hooklessPools: decoded.length - hooked.length,
      hooks: hooks.length,
      hooksWithCode: hooks.filter((h) => h.status === "ok").length,
    },
  };

  const hooksFile: HooksFile = { meta, hooks };
  const poolsFile: PoolsFile = { meta, pools };
  mkdirSync(opts.outDir, { recursive: true });
  const hooksPath = path.join(opts.outDir, "hooks.json");
  const poolsPath = path.join(opts.outDir, "pools.json");
  writeFileSync(hooksPath, JSON.stringify(hooksFile, null, 2) + "\n");
  writeFileSync(poolsPath, JSON.stringify(poolsFile, null, 2) + "\n");
  return { hooksFile, poolsFile, hooksPath, poolsPath };
}
