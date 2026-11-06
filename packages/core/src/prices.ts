// Approximate USD prices of a few mainnet majors. Used ONLY to size probe swaps (packages/sim) and
// to rank which pools to mirror first when the Arkiv budget is short (packages/arkiv). Never used
// to compute a take: TakeMeter values flows at the pool's own on-chain price.

import { NATIVE_CURRENCY } from "./constants";
import type { PoolRecord } from "./types";

export const APPROX_PRICES_USD: Readonly<Record<string, number>> = {
  [NATIVE_CURRENCY]: 3000, // ETH
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 3000, // WETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": 3600, // wstETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1, // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 1, // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f": 1, // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 95000, // WBTC
};

const Q96 = 2 ** 96;

/**
 * Approximate USD depth of a pool at its current price: the virtual reserve of the priced side
 * (concentrated liquidity L at the current tick: x = L / sqrtP, y = L * sqrtP), valued with
 * APPROX_PRICES_USD. Ranking only, never shown as a fact. 0 if no side is priced or no state.
 */
export function depthUsd(p: Pick<PoolRecord, "state" | "currency0" | "currency1" | "decimals0" | "decimals1">): number {
  if (!p.state) return 0;
  const L = Number(BigInt(p.state.liquidity));
  const sqrtP = Number(BigInt(p.state.sqrtPriceX96)) / Q96;
  if (!(L > 0) || !(sqrtP > 0)) return 0;
  const side = (token: string, decimals: number | null, rawAmount: number) => {
    const price = APPROX_PRICES_USD[token.toLowerCase()];
    return price ? (rawAmount / 10 ** (decimals ?? 18)) * price : 0;
  };
  const usd = Math.max(side(p.currency0, p.decimals0, L / sqrtP), side(p.currency1, p.decimals1, L * sqrtP));
  return Number.isFinite(usd) ? usd : 0;
}
