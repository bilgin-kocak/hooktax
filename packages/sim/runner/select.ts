// Pick which real hooked pools to measure, and size a small probe swap for each.
//
// The USD prices here size the probe swap only (a "small amount" per the spec). They are NOT used
// to compute the take: TakeMeter values flows at the pool's own on-chain price. So an approximate
// price is fine; it just keeps the probe near a fixed USD notional instead of a fixed token count.

import type { HookRecord, PoolRecord } from "@hooktax/core";
import { NATIVE_CURRENCY } from "@hooktax/core";

/** Approximate USD prices for sizing only (mainnet). Unknown tokens use a decimal-based fallback. */
export const SIZING_PRICES_USD: Record<string, number> = {
  [NATIVE_CURRENCY]: 3000, // ETH
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 3000, // WETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": 3600, // wstETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1, // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 1, // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f": 1, // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 95000, // WBTC
};

const TARGET_USD = 50;

export function probeAmount(token: string, decimals: number | null): bigint {
  const d = decimals ?? 18;
  const price = SIZING_PRICES_USD[token.toLowerCase()];
  if (price && price > 0) {
    // floor(TARGET_USD / price * 10^d), with cents of precision in the division.
    // amount = (TARGET_USD / price) * 10^d, computed in cents to avoid float: both in cents cancel.
    const usdCents = BigInt(Math.round(TARGET_USD * 100));
    const priceCents = BigInt(Math.round(price * 100));
    return (usdCents * 10n ** BigInt(d)) / priceCents || 1n;
  }
  // Unknown token: ~0.001 of a unit for d>=3, else 1 base unit.
  return d >= 3 ? 10n ** BigInt(d - 3) : 1n;
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

export function selectPools(hooks: HookRecord[], pools: PoolRecord[], opts: SelectOptions): Selection[] {
  const byId = new Map(pools.map((p) => [p.poolId.toLowerCase(), p]));
  const mk = (p: PoolRecord): Selection => ({
    poolId: p.poolId,
    currency0: p.currency0,
    currency1: p.currency1,
    fee: p.isDynamicFee ? 0x800000 : p.fee,
    tickSpacing: p.tickSpacing,
    hooks: p.hooks,
    amount0In: probeAmount(p.currency0, p.decimals0),
    amount1In: probeAmount(p.currency1, p.decimals1),
  });

  if (opts.poolId) {
    const p = byId.get(opts.poolId.toLowerCase());
    return p ? [mk(p)] : [];
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
      out.push(mk(p));
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
