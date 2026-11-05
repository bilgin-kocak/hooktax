// Which entities to mirror first when the writer's tGLM does not cover everything (a full mirror
// is ~20.5 tGLM; a faucet claim is less). Ranking only: nothing here is shown as a fact.
//
//   tier 0  hook is upgradeable AND can change swap amounts (worst case: 100% of swap value)
//   tier 1  measured on the fork (a non-demo SimResult exists)
//   tier 2  upgradeable
//   tier 3  can change swap amounts
//   tier 4  has a dynamic-fee pool
//   tier 5  everything else
//
// Within a tier, deeper pools first: depth is the virtual reserve of the priced side at the
// current price (concentrated liquidity L at the current tick), valued with APPROX_PRICES_USD.
// A hook ranks by its deepest active pool.

import { APPROX_PRICES_USD, type HookRecord, type PoolRecord, type SimResultRecord } from "@hooktax/core";
import { isActivePool } from "./map";

const Q96 = 2 ** 96;

/** Approximate USD depth at the current price (ranking only). 0 if no side is priced. */
export function depthUsd(p: PoolRecord): number {
  if (!p.state) return 0;
  const L = Number(BigInt(p.state.liquidity));
  const sqrtP = Number(BigInt(p.state.sqrtPriceX96)) / Q96;
  if (!(L > 0) || !(sqrtP > 0)) return 0;
  const side = (token: string, decimals: number | null, rawAmount: number) => {
    const price = APPROX_PRICES_USD[token.toLowerCase()];
    return price ? (rawAmount / 10 ** (decimals ?? 18)) * price : 0;
  };
  // Virtual reserves at the current price: x = L / sqrtP (token0), y = L * sqrtP (token1).
  const usd = Math.max(side(p.currency0, p.decimals0, L / sqrtP), side(p.currency1, p.decimals1, L * sqrtP));
  return Number.isFinite(usd) ? usd : 0;
}

export function hookTier(h: HookRecord, measuredHooks: ReadonlySet<string>): number {
  if (h.worstCase.level === "swap-100") return 0;
  if (measuredHooks.has(h.address.toLowerCase())) return 1;
  if (h.isUpgradeable) return 2;
  if (h.canAffectSwapAmounts) return 3;
  if (h.hasDynamicFeePool) return 4;
  return 5;
}

export function poolTier(p: PoolRecord, h: HookRecord, measuredPools: ReadonlySet<string>, measuredHooks: ReadonlySet<string>): number {
  if (h.worstCase.level === "swap-100") return 0;
  if (measuredPools.has(p.poolId.toLowerCase())) return 1;
  return Math.max(2, hookTier(h, measuredHooks));
}

export interface MirrorPriority {
  /** Comparators over lowercase natural IDs (hook address, poolId); unknown IDs sort last. */
  compareHooks(a: string, b: string): number;
  comparePools(a: string, b: string): number;
}

type Rank = readonly [tier: number, depth: number];

function comparator(ranks: ReadonlyMap<string, Rank>) {
  return (a: string, b: string) => {
    const ra = ranks.get(a) ?? [99, 0];
    const rb = ranks.get(b) ?? [99, 0];
    return ra[0] - rb[0] || rb[1] - ra[1] || (a < b ? -1 : a > b ? 1 : 0);
  };
}

export function mirrorPriority(
  hooks: readonly HookRecord[],
  pools: readonly PoolRecord[],
  sims: readonly Pick<SimResultRecord, "poolId" | "hook" | "isDemo">[],
): MirrorPriority {
  const live = sims.filter((s) => !s.isDemo);
  const measuredPools = new Set(live.map((s) => s.poolId.toLowerCase()));
  const measuredHooks = new Set(live.map((s) => s.hook.toLowerCase()));
  const hookByAddr = new Map(hooks.map((h) => [h.address.toLowerCase(), h]));

  const poolRanks = new Map<string, Rank>();
  const hookDepth = new Map<string, number>();
  for (const p of pools) {
    const h = hookByAddr.get(p.hooks.toLowerCase());
    if (!h) continue;
    const depth = isActivePool(p) ? depthUsd(p) : 0;
    poolRanks.set(p.poolId.toLowerCase(), [poolTier(p, h, measuredPools, measuredHooks), depth]);
    const k = h.address.toLowerCase();
    hookDepth.set(k, Math.max(hookDepth.get(k) ?? 0, depth));
  }
  const hookRanks = new Map<string, Rank>(
    hooks.map((h) => [h.address.toLowerCase(), [hookTier(h, measuredHooks), hookDepth.get(h.address.toLowerCase()) ?? 0]]),
  );
  return { compareHooks: comparator(hookRanks), comparePools: comparator(poolRanks) };
}
