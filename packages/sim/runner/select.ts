// Pick which real hooked pools to measure, and size a small probe swap for each.
//
// The USD prices here size the probe swap only (a "small amount" per the spec). They are NOT used
// to compute the take: TakeMeter values flows at the pool's own on-chain price. So an approximate
// price is fine; it just keeps the probe near a fixed USD notional instead of a fixed token count.

import type { HookRecord, PoolRecord } from "@hooktax/core";
import { APPROX_PRICES_USD } from "@hooktax/core";

/** Approximate USD prices for sizing only (mainnet), shared with the Arkiv mirror's ranking. */
export const SIZING_PRICES_USD = APPROX_PRICES_USD;

const TARGET_USD = 50;
const Q192 = 1n << 192n;

/** ~$50 of a priced token in raw units, or null if the token has no sizing price. */
export function pricedAmount(token: string, decimals: number | null): bigint | null {
  const price = SIZING_PRICES_USD[token.toLowerCase()];
  if (!price || price <= 0) return null;
  const d = decimals ?? 18;
  // amount = (TARGET_USD / price) * 10^d, computed in cents to avoid float: both in cents cancel.
  const usdCents = BigInt(Math.round(TARGET_USD * 100));
  const priceCents = BigInt(Math.round(price * 100));
  return (usdCents * 10n ** BigInt(d)) / priceCents || 1n;
}

/**
 * Both probe amounts for a pool, each worth ~$50. At least one token must be priced; the other
 * side is converted through the pool's current price p = (sqrtPriceX96 / 2^96)^2 (token1 raw per
 * token0 raw), so a dust-valued side can never blow up the take ratio. Returns null when neither
 * token is priced (we don't measure those: we can't size a meaningful swap, and an undersized
 * probe makes the take ratio meaningless).
 */
export function probeAmounts(
  currency0: string,
  decimals0: number | null,
  currency1: string,
  decimals1: number | null,
  sqrtPriceX96: bigint,
): { amount0In: bigint; amount1In: bigint } | null {
  let a0 = pricedAmount(currency0, decimals0);
  let a1 = pricedAmount(currency1, decimals1);
  if (a0 === null && a1 === null) return null;
  if (sqrtPriceX96 <= 0n) return null;
  const sq = sqrtPriceX96 * sqrtPriceX96; // 2^192 * p
  if (a0 === null) a0 = (a1! * Q192) / sq || 1n; // amount0 = amount1 / p
  if (a1 === null) a1 = (a0 * sq) / Q192 || 1n; // amount1 = amount0 * p
  return { amount0In: a0, amount1In: a1 };
}

export interface Selection {
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  amount0In: bigint;
  amount1In: bigint;
}

export interface SelectOptions {
  /** Only this pool (used by the API's single-pool refresh). */
  poolId?: string;
  /** Measure at most this many pools total. */
  limit: number;
  /** Consider at most this many hooks (by pool count, highest first). */
  maxHooks: number;
  /** Measure at most this many pools per hook. */
  perHook: number;
}

/** Active = had in-range liquidity at the import snapshot. */
export function isActive(p: PoolRecord): boolean {
  return p.state !== null && BigInt(p.state.liquidity) > 0n;
}

function toSelection(p: PoolRecord): Selection | null {
  const sqrt = p.state ? BigInt(p.state.sqrtPriceX96) : BigInt(p.initSqrtPriceX96);
  const amounts = probeAmounts(p.currency0, p.decimals0, p.currency1, p.decimals1, sqrt);
  if (!amounts) return null;
  return {
    poolId: p.poolId,
    currency0: p.currency0,
    currency1: p.currency1,
    fee: p.isDynamicFee ? 0x800000 : p.fee,
    tickSpacing: p.tickSpacing,
    hooks: p.hooks,
    ...amounts,
  };
}

export function selectPools(hooks: HookRecord[], pools: PoolRecord[], opts: SelectOptions): Selection[] {
  const byId = new Map(pools.map((p) => [p.poolId.toLowerCase(), p]));

  if (opts.poolId) {
    const p = byId.get(opts.poolId.toLowerCase());
    const s = p ? toSelection(p) : null;
    return s ? [s] : [];
  }

  // hooks.json is already sorted by pool count desc.
  const out: Selection[] = [];
  for (const hook of hooks.slice(0, opts.maxHooks)) {
    if (hook.status !== "ok") continue;
    let taken = 0;
    for (const id of hook.poolIds) {
      if (out.length >= opts.limit) return out;
      if (taken >= opts.perHook) break;
      const p = byId.get(id.toLowerCase());
      if (!p || !isActive(p)) continue;
      const s = toSelection(p);
      if (!s) continue; // neither token priced: skip
      out.push(s);
      taken++;
    }
  }
  return out;
}

export function selectionLines(sel: Selection[]): string {
  return sel
    .map((s) => [s.poolId, s.currency0, s.currency1, s.fee, s.tickSpacing, s.hooks, s.amount0In, s.amount1In].join("|"))
    .join("\n");
}
