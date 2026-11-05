// Arkiv schemas for HookAtlas. Read the docs first: https://docs.arkiv.network (schemas/define,
// schemas/column-types, reference/limits). Notes that shaped these schemas:
//   - Only `.indexed()` columns can be filtered on; sorting works on any non-bytes column.
//   - A named schema allows at most 31 columns (the `arkiv.schema` tag is the 32nd attribute).
//   - str values are at most 128 bytes; one create's bytes values share a 128 KiB budget.
//   - Arkiv is public: anyone can write entities with these names. Readers MUST filter by the
//     HookTax writer address (`.ownedBy(writer)`) to trust what they read.
//
// Schema names carry a version so a breaking change can live next to the old data.

import { addr, bool, bytes, dec, defineSchema, i32, str, u256, u64 } from "@arkiv-network/sdk/schema";

export const SCHEMA_VERSION = "v1";

/** One entity per Uniswap v4 hook on Ethereum mainnet. Refreshed (patched/extended) on each import. */
export const HookSchema = defineSchema("hooktax.v1.hook", {
  hook: addr().indexed(),
  permissionBits: i32().indexed(),
  beforeInitialize: bool().indexed(),
  afterInitialize: bool().indexed(),
  beforeAddLiquidity: bool().indexed(),
  afterAddLiquidity: bool().indexed(),
  beforeRemoveLiquidity: bool().indexed(),
  afterRemoveLiquidity: bool().indexed(),
  beforeSwap: bool().indexed(),
  afterSwap: bool().indexed(),
  beforeDonate: bool().indexed(),
  afterDonate: bool().indexed(),
  beforeSwapReturnsDelta: bool().indexed(),
  afterSwapReturnsDelta: bool().indexed(),
  afterAddLiquidityReturnsDelta: bool().indexed(),
  afterRemoveLiquidityReturnsDelta: bool().indexed(),
  isUpgradeable: bool().indexed(),
  hasDynamicFeePool: bool().indexed(),
  canAffectSwapAmounts: bool().indexed(),
  canAffectLpAmounts: bool().indexed(),
  poolCount: i32().indexed(),
  activePoolCount: i32().indexed(),
  /** Copy of the latest live SimResult's take, for filtering/sorting. Unset when none is live. */
  lastMeasuredTakeBps: dec().indexed().optional(),
  worstCase: str().indexed(),
  proxyType: str().indexed(),
  owner: addr().indexed().optional(),
  codeHash: str().indexed().optional(),
  status: str().indexed(),
  firstSeenBlock: u64(),
  /** sha256 of this entity's other values; lets an import skip unchanged hooks. */
  contentHash: str(),
  /** JSON: proxy details, code size, owner kind, sample pool IDs. */
  details: bytes(),
});

/** One entity per hooked pool that had in-range liquidity at the import's snapshot block. */
export const PoolSchema = defineSchema("hooktax.v1.pool", {
  poolId: str().indexed(),
  hook: addr().indexed(),
  currency0: addr().indexed(),
  currency1: addr().indexed(),
  symbol0: str().indexed().optional(),
  symbol1: str().indexed().optional(),
  fee: i32().indexed(),
  isDynamicFee: bool().indexed(),
  hasLiquidity: bool().indexed(),
  hookCanAffectSwapAmounts: bool().indexed(),
  hookIsUpgradeable: bool().indexed(),
  hookWorstCase: str().indexed(),
  lastMeasuredTakeBps: dec().indexed().optional(),
  tickSpacing: i32(),
  lpFee: i32().optional(),
  liquidity: u256().optional(),
  decimals0: i32().optional(),
  decimals1: i32().optional(),
  createdBlock: u64(),
  contentHash: str(),
});

/**
 * One fork measurement. Expires after 7 days, so a stale safety number disappears instead of
 * misleading people. `isDemo` marks results for the planted SneakyFeeHook, which exists only on a
 * local fork and is not a mainnet hook.
 */
export const SimResultSchema = defineSchema("hooktax.v1.simresult", {
  simId: str().indexed(),
  poolId: str().indexed(),
  hook: addr().indexed(),
  scenario: str().indexed(),
  status: str().indexed(),
  measuredTakeBps: dec().indexed().optional(),
  isDemo: bool().indexed(),
  forkBlock: u64().indexed(),
  takeZeroForOneBps: dec().optional(),
  takeOneForZeroBps: dec().optional(),
  lpFeeBps: dec().optional(),
  measuredAt: u64(),
  /**
   * sha256 of this entity's other values. SimResults are readonly, so when a re-derivation changes
   * one (runner/rederive.ts) the sync replaces it: delete + create. Optional: entities written
   * before this column existed have none, and are replaced once.
   */
  contentHash: str().optional(),
  details: bytes(),
});

/** One entity per import run: freshness and provenance of everything above. */
export const ImportSchema = defineSchema("hooktax.v1.import", {
  runId: str().indexed(),
  toBlock: u64().indexed(),
  pools: i32(),
  hookedPools: i32(),
  hooks: i32(),
  hooksUpgradeable: i32(),
  hooksSwapDelta: i32(),
  mirroredPools: i32(),
  generatedAt: u64(),
  source: str(),
  details: bytes(),
});

export const SCHEMAS = { hook: HookSchema, pool: PoolSchema, simResult: SimResultSchema, import: ImportSchema };
