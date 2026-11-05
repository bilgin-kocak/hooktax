// HookTax live refresh on Chainlink CRE.
//
// Trigger: EVM log trigger on the Uniswap v4 PoolManager (Ethereum mainnet), topic0 = Initialize.
// `hooks` is NOT an indexed event field, so the trigger cannot filter `hooks != 0`; the handler
// decodes the log and skips hookless pools in code.
// Action: one HTTP POST to the HookTax API (`/refresh`), which verifies the pool onchain, then
// re-indexes, simulates and mirrors it to Arkiv. The handler checks the API's answer.
//
// Why CRE: the trigger runs on a decentralized oracle network, not on our server. Anyone can
// read this workflow and see exactly which onchain event causes a refresh, and the HTTP call
// carries a consensus-checked result.

import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  getNetwork,
  hexToBase64,
  ok,
  type EVMLog,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeEventLog, keccak256, parseAbi, toBytes, type Hex } from "viem";
import { z } from "zod";

export const configSchema = z.object({
  chainSelectorName: z.string(),
  poolManager: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  refreshUrl: z.string().url(),
});
export type Config = z.infer<typeof configSchema>;

/** v4-core v4.0.0 IPoolManager.Initialize. */
export const INITIALIZE_ABI = parseAbi([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
]);
export const INITIALIZE_TOPIC0 = keccak256(toBytes("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"));
export const REFRESH_TOKEN_SECRET = "REFRESH_API_TOKEN";

// Hook permission bits (low 14 bits of the hook address, v4-core Hooks.sol).
const BEFORE_SWAP_RETURNS_DELTA = 1 << 3;
const AFTER_SWAP_RETURNS_DELTA = 1 << 2;
const DYNAMIC_FEE_FLAG = 0x800000;

export interface InitializeEvent {
  poolId: Hex;
  currency0: Hex;
  currency1: Hex;
  fee: number;
  hooks: Hex;
  txHash: Hex;
}

export function decodeInitialize(log: Pick<EVMLog, "topics" | "data" | "txHash">): InitializeEvent {
  const topics = log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]];
  const { args } = decodeEventLog({ abi: INITIALIZE_ABI, eventName: "Initialize", data: bytesToHex(log.data), topics });
  return {
    poolId: args.id,
    currency0: args.currency0,
    currency1: args.currency1,
    fee: args.fee,
    hooks: args.hooks,
    txHash: bytesToHex(log.txHash),
  };
}

export const permissionBits = (hook: Hex): number => Number(BigInt(hook) & 0x3fffn);

/** What the workflow reaches consensus on: the API's verified answer. */
export interface RefreshResult {
  ok: boolean;
  statusCode: number;
  poolId: string;
  hook: string;
  permissionBits: number;
  worstCase: string;
  jobId: string;
  error: string;
}

export interface RefreshArgs {
  url: string;
  token: string;
  poolId: Hex;
  txHash: Hex;
}

export const postRefresh = (sendRequester: HTTPSendRequester, args: RefreshArgs): RefreshResult => {
  const body = Buffer.from(new TextEncoder().encode(JSON.stringify({ poolId: args.poolId, txHash: args.txHash }))).toString("base64");
  const resp = sendRequester
    .sendRequest({
      url: args.url,
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.token}` },
      // POST starts work: let one node call the API and the others reuse its cached response.
      // SDK 1.23.0 fields are `store` + `maxAge` (Duration); the POST guide still shows the older
      // `readFromCache` / `maxAgeMs` names (see docs/versions.md).
      cacheSettings: { store: true, maxAge: "60s" },
    })
    .result();
  const text = new TextDecoder().decode(resp.body);
  const empty = { poolId: "", hook: "", permissionBits: -1, worstCase: "", jobId: "" };
  if (!ok(resp)) return { ok: false, statusCode: resp.statusCode, ...empty, error: text.slice(0, 200) };
  try {
    const json = JSON.parse(text) as Partial<RefreshResult>;
    return {
      ok: json.ok === true,
      statusCode: resp.statusCode,
      poolId: String(json.poolId ?? ""),
      hook: String(json.hook ?? ""),
      permissionBits: Number(json.permissionBits ?? -1),
      worstCase: String(json.worstCase ?? ""),
      jobId: String(json.jobId ?? ""),
      error: "",
    };
  } catch {
    return { ok: false, statusCode: resp.statusCode, ...empty, error: "response is not JSON" };
  }
};

export const onInitialize = (runtime: Runtime<Config>, log: EVMLog): string => {
  const ev = decodeInitialize(log);
  if (BigInt(ev.hooks) === 0n) {
    runtime.log(`pool ${ev.poolId}: no hook, nothing to refresh`);
    return "skipped: pool has no hook";
  }
  const bits = permissionBits(ev.hooks);
  const swapDelta = (bits & (BEFORE_SWAP_RETURNS_DELTA | AFTER_SWAP_RETURNS_DELTA)) !== 0;
  runtime.log(
    `new hooked pool ${ev.poolId} hook ${ev.hooks} bits 0x${bits.toString(16).padStart(4, "0")}` +
      `${swapDelta ? " (can change swap amounts)" : ""}${ev.fee === DYNAMIC_FEE_FLAG ? " (dynamic fee)" : ""}`,
  );

  const token = runtime.getSecret({ id: REFRESH_TOKEN_SECRET }).result().value;
  const http = new cre.capabilities.HTTPClient();
  const res = http
    .sendRequest(runtime, postRefresh, consensusIdenticalAggregation<RefreshResult>())({
      url: runtime.config.refreshUrl,
      token,
      poolId: ev.poolId,
      txHash: ev.txHash,
    })
    .result();

  if (!res.ok) throw new Error(`HookTax API refused the refresh (HTTP ${res.statusCode}): ${res.error}`);
  if (res.poolId.toLowerCase() !== ev.poolId.toLowerCase()) {
    throw new Error(`HookTax API answered for ${res.poolId}, expected ${ev.poolId}`);
  }
  if (res.permissionBits !== bits) {
    throw new Error(`HookTax API reports permission bits ${res.permissionBits}, the event's hook has ${bits}`);
  }
  runtime.log(`refresh accepted: job ${res.jobId}, worst case ${res.worstCase}`);
  return `refresh queued for ${ev.poolId} (worst case: ${res.worstCase})`;
};

export function initWorkflow(config: Config) {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName, isTestnet: false });
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  return [
    cre.handler(
      evm.logTrigger({
        addresses: [hexToBase64(config.poolManager)],
        topics: [{ values: [hexToBase64(INITIALIZE_TOPIC0)] }],
        // Finalized: a reorged-out pool never triggers a refresh (same policy as the indexer).
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onInitialize,
    ),
  ];
}
