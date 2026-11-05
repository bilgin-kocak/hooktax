// Dataset shapes shared by the indexer (writer of data/*.json), the Arkiv mirror, the CLI and the web app.

import type { Capability, WorstCase } from "./capabilities";
import type { HookFlagName, HookPermissions } from "./permissions";
import type { ProxyType } from "./proxy";

export type UpgradeAuthoritySource =
  | "proxy-admin-owner" // transparent proxy: owner() of the ProxyAdmin in the admin slot
  | "admin-slot" // transparent proxy whose admin has no owner(): the admin itself
  | "beacon-owner" // beacon proxy: owner() of the beacon
  | "owner"; // UUPS / diamond / plain 1967: the hook's owner() (typical, not guaranteed)

export interface HookProxy {
  type: ProxyType;
  isUpgradeable: boolean;
  implementation: string | null;
  implementationCodeHash: string | null;
  admin: string | null;
  beacon: string | null;
  upgradeAuthority: string | null;
  upgradeAuthoritySource: UpgradeAuthoritySource | null;
}

export type HookStatus = "ok" | "no-code";

export interface HookRecord {
  address: string;
  permissionBits: number;
  permissions: HookPermissions;
  permissionNames: HookFlagName[];
  code: { size: number; hash: string | null };
  proxy: HookProxy;
  /** owner() if it is callable and returns an address. */
  owner: string | null;
  ownerIsContract: boolean | null;
  poolCount: number;
  poolIds: string[];
  dynamicFeePoolCount: number;
  hasDynamicFeePool: boolean;
  /** Block of the earliest Initialize that used this hook. */
  firstSeenBlock: number;
  isUpgradeable: boolean;
  canAffectSwapAmounts: boolean;
  canAffectLpAmounts: boolean;
  capabilities: Capability[];
  worstCase: WorstCase;
  status: HookStatus;
}

export interface PoolState {
  sqrtPriceX96: string;
  tick: number;
  protocolFee: number;
  /** Current LP fee in pips (for dynamic-fee pools this is the live value). */
  lpFee: number;
  /** In-range liquidity. "0" means a swap cannot be measured without adding liquidity. */
  liquidity: string;
}

export interface PoolRecord {
  poolId: string;
  currency0: string;
  currency1: string;
  symbol0: string | null;
  symbol1: string | null;
  decimals0: number | null;
  decimals1: number | null;
  /** Fee from the PoolKey, in pips. 0x800000 = dynamic. */
  fee: number;
  isDynamicFee: boolean;
  tickSpacing: number;
  hooks: string;
  initSqrtPriceX96: string;
  initTick: number;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  /** Pool state at meta.snapshotBlock (null if it could not be read). */
  state: PoolState | null;
}

export interface DatasetMeta {
  schemaVersion: 1;
  chainId: 1;
  poolManager: string;
  /** First block scanned for Initialize logs (the PoolManager deploy block). */
  fromBlock: number;
  /** Last block scanned (the finalized block at run time, unless overridden). */
  toBlock: number;
  /** Block at which contract state (code, slots, owner, pool state) was read. */
  snapshotBlock: number;
  generatedAt: string;
  source: string;
  /** RPC hostnames used. Never full URLs, because they can contain API keys. */
  rpcHosts: string[];
  counts: {
    pools: number;
    hookedPools: number;
    hooklessPools: number;
    hooks: number;
    hooksWithCode: number;
  };
}

export interface HooksFile {
  meta: DatasetMeta;
  hooks: HookRecord[];
}

export interface PoolsFile {
  meta: DatasetMeta;
  pools: PoolRecord[];
}

// ---------------------------------------------------------------------------
// Fork simulation results (M4/M5): produced by packages/sim, mirrored to Arkiv as SimResult.
// ---------------------------------------------------------------------------

export type SimStatus =
  | "ok"
  | "hook-reverted"
  | "no-liquidity"
  | "unsupported-token"
  | "swap-failed"
  | "not-run"
  | "error";

export type FlowRole = "swapper" | "pool-manager" | "hook" | "hook-owner" | "other";

/** Net value movement for one address and one token during a single fork swap. */
export interface ValueFlow {
  address: string;
  role: FlowRole;
  /** Currency address; 0x000…000 is native ETH. */
  token: string;
  /** Net change in raw units (signed decimal string). */
  amount: string;
  kind: "erc20" | "native" | "erc6909";
}

export interface DirectionResult {
  zeroForOne: boolean;
  status: SimStatus;
  error: string | null;
  tokenIn: string;
  tokenOut: string;
  /** Raw units the swapper paid / received. */
  amountIn: string;
  amountOut: string;
  /** Value that went to the hook, its owner or other addresses, valued in input-token raw units. */
  takeAmountIn: string;
  /** takeAmountIn / amountIn in basis points (excludes normal LP fees). */
  takeBps: number | null;
  /** The LP fee the pool charged on this swap, in basis points. */
  lpFeeBps: number | null;
  flows: ValueFlow[];
}

export interface SimResultRecord {
  /** `${poolId}:${scenario}:${forkBlock}` */
  simId: string;
  poolId: string;
  hook: string;
  /** e.g. "today", "after-admin-upgrade", "max-dynamic-fee". */
  scenario: string;
  label?: string;
  /** True for the planted SneakyFeeHook, which exists only on a local fork. */
  isDemo: boolean;
  forkBlock: number;
  /** Unix seconds. */
  measuredAt: number;
  status: SimStatus;
  /** Worst direction's take in bps; null unless at least one direction measured ok. */
  measuredTakeBps: number | null;
  lpFeeBps: number | null;
  directions: DirectionResult[];
  notes?: string[];
}

export interface SimResultsFile {
  meta: { schemaVersion: 1; forkBlock: number; generatedAt: string; source: string; count: number };
  results: SimResultRecord[];
}
