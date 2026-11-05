// Mainnet READ-ONLY client. HookTax never sends a transaction to mainnet.

import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { mainnet } from "viem/chains";

/**
 * Keyless public endpoints, used when MAINNET_RPC_URL is unset (and as backups when it is set).
 * Both were checked on 2026-11-05 for 1M-block eth_getLogs, historical state, JSON-RPC batching
 * and the `finalized` tag (docs/versions.md).
 */
export const PUBLIC_FALLBACK_RPCS = [
  "https://mainnet.gateway.tenderly.co",
  "https://rpc.mevblocker.io",
] as const;

export function mainnetRpcUrls(env: NodeJS.ProcessEnv = process.env): {
  urls: string[];
  usingPublicFallback: boolean;
} {
  const primary = env.MAINNET_RPC_URL?.trim();
  if (primary) return { urls: [primary, ...PUBLIC_FALLBACK_RPCS], usingPublicFallback: false };
  return { urls: [...PUBLIC_FALLBACK_RPCS], usingPublicFallback: true };
}

/** Hostname only, safe to log and to store in dataset metadata (paths/queries can carry API keys). */
export function rpcHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

export function makeMainnetClient(urls: string[]): PublicClient {
  const transports = urls.map((url) =>
    http(url, {
      batch: { batchSize: 25, wait: 20 },
      retryCount: 4,
      retryDelay: 500,
      timeout: 60_000,
    }),
  );
  const transport = transports.length === 1 ? transports[0]! : fallback(transports, { retryCount: 2 });
  return createPublicClient({ chain: mainnet, transport }) as PublicClient;
}
