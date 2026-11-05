// HookAtlas records -> Arkiv entity values. Pure functions (no network), unit-tested.

import { addr, bytes, dec, u64, type CreateEntityValues } from "@arkiv-network/sdk/schema";
import { sha256, stringToHex } from "viem";
import type { HookRecord, PoolRecord, SimResultRecord } from "@hooktax/core";
import type { HookSchema, PoolSchema, SimResultSchema } from "./schemas";

export type HookValues = CreateEntityValues<typeof HookSchema>;
export type PoolValues = CreateEntityValues<typeof PoolSchema>;
export type SimResultValues = CreateEntityValues<typeof SimResultSchema>;

/** Optional columns per schema: a patch must `unset` them when they disappear. */
export const HOOK_OPTIONAL = ["lastMeasuredTakeBps", "owner", "codeHash"] as const;
export const POOL_OPTIONAL = [
  "symbol0",
  "symbol1",
  "lastMeasuredTakeBps",
  "lpFee",
  "liquidity",
  "decimals0",
  "decimals1",
] as const;

/** Deterministic JSON (sorted keys, bigint as string, bytes as hex) for content hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });
}

export function contentHashOf(values: Record<string, unknown>): string {
  return sha256(stringToHex(canonicalJson(values))).slice(2);
}

const jsonBytes = (obj: unknown) => bytes(stringToHex(JSON.stringify(obj)));

/** bps (number) -> dec string with at most 4 decimals, e.g. 30 -> "30", 0.12345 -> "0.1235". */
export function bpsDec(bps: number): string {
  if (!Number.isFinite(bps)) throw new Error(`invalid bps ${bps}`);
  const s = bps.toFixed(4);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export interface HookContext {
  /** Number of the hook's pools with in-range liquidity at the snapshot block. */
  activePoolCount: number;
  /** Latest live (unexpired) SimResult take for this hook, in bps. */
  lastMeasuredTakeBps?: number;
  /** Up to 10 pool IDs, pools with liquidity first. */
  samplePoolIds: string[];
}

export function hookValues(h: HookRecord, ctx: HookContext): HookValues {
  const p = h.permissions;
  const base = {
    hook: addr(h.address),
    permissionBits: h.permissionBits,
    beforeInitialize: p.beforeInitialize,
    afterInitialize: p.afterInitialize,
    beforeAddLiquidity: p.beforeAddLiquidity,
    afterAddLiquidity: p.afterAddLiquidity,
    beforeRemoveLiquidity: p.beforeRemoveLiquidity,
    afterRemoveLiquidity: p.afterRemoveLiquidity,
    beforeSwap: p.beforeSwap,
    afterSwap: p.afterSwap,
    beforeDonate: p.beforeDonate,
    afterDonate: p.afterDonate,
    beforeSwapReturnsDelta: p.beforeSwapReturnsDelta,
    afterSwapReturnsDelta: p.afterSwapReturnsDelta,
    afterAddLiquidityReturnsDelta: p.afterAddLiquidityReturnsDelta,
    afterRemoveLiquidityReturnsDelta: p.afterRemoveLiquidityReturnsDelta,
    isUpgradeable: h.isUpgradeable,
    hasDynamicFeePool: h.hasDynamicFeePool,
    canAffectSwapAmounts: h.canAffectSwapAmounts,
    canAffectLpAmounts: h.canAffectLpAmounts,
    poolCount: h.poolCount,
    activePoolCount: ctx.activePoolCount,
    ...(ctx.lastMeasuredTakeBps !== undefined ? { lastMeasuredTakeBps: dec(bpsDec(ctx.lastMeasuredTakeBps)) } : {}),
    worstCase: h.worstCase.level,
    proxyType: h.proxy.type,
    ...(h.owner ? { owner: addr(h.owner) } : {}),
    ...(h.code.hash ? { codeHash: h.code.hash.toLowerCase() } : {}),
    status: h.status,
    firstSeenBlock: u64(BigInt(h.firstSeenBlock)),
    details: jsonBytes({
      v: 1,
      codeSize: h.code.size,
      proxy: {
        implementation: h.proxy.implementation,
        implementationCodeHash: h.proxy.implementationCodeHash,
        admin: h.proxy.admin,
        beacon: h.proxy.beacon,
        upgradeAuthority: h.proxy.upgradeAuthority,
        upgradeAuthoritySource: h.proxy.upgradeAuthoritySource,
      },
      ownerIsContract: h.ownerIsContract,
      dynamicFeePoolCount: h.dynamicFeePoolCount,
      samplePoolIds: ctx.samplePoolIds.slice(0, 10),
    }),
  };
  return { ...base, contentHash: contentHashOf(base) };
}

export interface PoolContext {
  hook: Pick<HookRecord, "canAffectSwapAmounts" | "isUpgradeable" | "worstCase">;
  lastMeasuredTakeBps?: number;
}

export function poolValues(p: PoolRecord, ctx: PoolContext): PoolValues {
  const liquidity = p.state ? BigInt(p.state.liquidity) : undefined;
  const base = {
    poolId: p.poolId.toLowerCase(),
    hook: addr(p.hooks),
    currency0: addr(p.currency0),
    currency1: addr(p.currency1),
    ...(p.symbol0 ? { symbol0: p.symbol0 } : {}),
    ...(p.symbol1 ? { symbol1: p.symbol1 } : {}),
    fee: p.fee,
    isDynamicFee: p.isDynamicFee,
    hasLiquidity: liquidity !== undefined && liquidity > 0n,
    hookCanAffectSwapAmounts: ctx.hook.canAffectSwapAmounts,
    hookIsUpgradeable: ctx.hook.isUpgradeable,
    hookWorstCase: ctx.hook.worstCase.level,
    ...(ctx.lastMeasuredTakeBps !== undefined ? { lastMeasuredTakeBps: dec(bpsDec(ctx.lastMeasuredTakeBps)) } : {}),
    tickSpacing: p.tickSpacing,
    ...(p.state ? { lpFee: p.state.lpFee } : {}),
    ...(liquidity !== undefined ? { liquidity } : {}),
    ...(p.decimals0 !== null ? { decimals0: p.decimals0 } : {}),
    ...(p.decimals1 !== null ? { decimals1: p.decimals1 } : {}),
    createdBlock: u64(BigInt(p.blockNumber)),
  };
  return { ...base, contentHash: contentHashOf(base) };
}

export function simResultValues(r: SimResultRecord): SimResultValues {
  const dir = (z: boolean) => r.directions.find((d) => d.zeroForOne === z);
  const z1 = dir(true);
  const z0 = dir(false);
  return {
    simId: r.simId,
    poolId: r.poolId.toLowerCase(),
    hook: addr(r.hook),
    scenario: r.scenario,
    status: r.status,
    ...(r.measuredTakeBps !== null ? { measuredTakeBps: dec(bpsDec(r.measuredTakeBps)) } : {}),
    isDemo: r.isDemo,
    forkBlock: u64(BigInt(r.forkBlock)),
    ...(z1?.takeBps != null ? { takeZeroForOneBps: dec(bpsDec(z1.takeBps)) } : {}),
    ...(z0?.takeBps != null ? { takeOneForZeroBps: dec(bpsDec(z0.takeBps)) } : {}),
    ...(r.lpFeeBps !== null ? { lpFeeBps: dec(bpsDec(r.lpFeeBps)) } : {}),
    measuredAt: u64(BigInt(r.measuredAt)),
    details: jsonBytes({ v: 1, directions: r.directions, notes: r.notes ?? [], label: r.label ?? null }),
  };
}

/** Pools to mirror: hooked pools with in-range liquidity at the snapshot block. */
export function isActivePool(p: PoolRecord): boolean {
  return p.state !== null && BigInt(p.state.liquidity) > 0n;
}

/** Up to `n` pool IDs for a hook, active pools first, then chain order. */
export function samplePoolIds(hook: HookRecord, poolsById: ReadonlyMap<string, PoolRecord>, n = 10): string[] {
  const active: string[] = [];
  const rest: string[] = [];
  for (const id of hook.poolIds) {
    const pool = poolsById.get(id);
    (pool && isActivePool(pool) ? active : rest).push(id);
    if (active.length >= n) break;
  }
  return [...active, ...rest].slice(0, n);
}
