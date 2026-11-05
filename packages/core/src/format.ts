// Small display helpers shared by the CLI and the web app.

import { DYNAMIC_FEE_FLAG, NATIVE_CURRENCY } from "./constants";

/** Pool fee (pips) -> "0.30%" / "dynamic". */
export function formatFee(feePips: number): string {
  if (feePips === DYNAMIC_FEE_FLAG) return "dynamic";
  return `${trimZeros((feePips / 10_000).toFixed(4))}%`;
}

/** Basis points -> "0.30%". */
export function formatBps(bps: number): string {
  return `${trimZeros((bps / 100).toFixed(4))}%`;
}

export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function currencyLabel(address: string, symbol: string | null): string {
  if (address.toLowerCase() === NATIVE_CURRENCY) return "ETH";
  return symbol && symbol.length > 0 ? symbol : shortAddress(address);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
