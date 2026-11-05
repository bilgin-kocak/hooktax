import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const RABDI_CHAIN_ID = 7794095;
export const RABDI_EXPLORER = "https://rabdi.explorer.arkiv.network";

/** `""` = the public, heavily rate-limited endpoint (the SDK warns once). */
export function arkivChain(accessKey: string = process.env.ARKIV_ACCESS_KEY ?? "") {
  return rabdi({ accessKey });
}

// The access key is a URL path segment, so transport errors can contain it: never log raw
// transport errors (see redactArkiv in util.ts).
const transportOptions = { retryCount: 5, retryDelay: 1000, timeout: 60_000 } as const;

export function makePublicClient(accessKey?: string) {
  return createPublicClient({ chain: arkivChain(accessKey), transport: http(undefined, transportOptions) });
}

export function makeWalletClient(privateKey: Hex, accessKey?: string) {
  return createWalletClient({
    chain: arkivChain(accessKey),
    transport: http(undefined, transportOptions),
    account: privateKeyToAccount(privateKey),
  });
}

export type ArkivPublicClient = ReturnType<typeof makePublicClient>;
export type ArkivWalletClient = ReturnType<typeof makeWalletClient>;

/** Remove the access key (a URL path segment) from any message before it is printed. */
export function redactArkiv(msg: string): string {
  return msg.replace(/(rpc\.rabdi\.db-chain\.testnet\.arkiv\.network)\/[^\s"'/]+/g, "$1/<access-key>");
}

/**
 * eth_gasPrice. The SDK's PublicArkivClient type lists only Arkiv actions, but the client is built
 * with viem's publicActions too (createPublicClient.ts: `.extend(publicActions)`), so this cast is safe.
 */
export function gasPriceOf(client: ArkivPublicClient): Promise<bigint> {
  return (client as unknown as PublicClient).getGasPrice();
}
