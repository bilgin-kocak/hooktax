// Onchain facts for hooks, pools and tokens, all read at one pinned snapshot block.
//
// Contract reads are individual eth_calls (JSON-RPC-batched by the transport), NOT Multicall3:
// aggregate3 forwards all gas to each sub-call, so a single hostile fallback that burns gas
// could fail a whole batch. A failed call becomes `null`; transport problems (rate limits,
// timeouts) are retried and never silently turned into `null`.

import {
  BaseError,
  HttpRequestError,
  TimeoutError,
  hexToString,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  EIP1967_ADMIN_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  NATIVE_CURRENCY,
  STATE_VIEW,
  slotToAddress,
  type PoolState,
} from "@hooktax/core";
import { isRateLimitError, mapLimit, sleep } from "./util";

const OWNABLE_ABI = parseAbi(["function owner() view returns (address)"]);
const UUPS_ABI = parseAbi(["function proxiableUUID() view returns (bytes32)"]);
const BEACON_ABI = parseAbi(["function implementation() view returns (address)"]);
const DIAMOND_LOUPE_ABI = parseAbi(["function facetAddresses() view returns (address[])"]);
const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const ERC20_SYMBOL_BYTES32_ABI = parseAbi(["function symbol() view returns (bytes32)"]);

const CONCURRENCY = 6;

export function isTransportError(err: unknown): boolean {
  if (isRateLimitError(err)) return true;
  if (err instanceof BaseError) {
    return Boolean(
      err.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError || isRateLimitError(e)),
    );
  }
  return false;
}

/** Contract read that returns null when the call itself fails (revert, no code, bad return data). */
async function tryRead<T>(fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransportError(err)) return null;
      if (attempt >= 5) throw err;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/** Plain RPC read (getCode / getStorageAt): transport errors are retried, then fatal. */
async function mustRead<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransportError(err) || attempt >= 5) throw err;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

export interface HookFacts {
  address: string;
  code: Hex | null;
  codeSize: number;
  codeHash: string | null;
  implementationSlot: Hex | null;
  adminSlot: Hex | null;
  beaconSlot: Hex | null;
  owner: string | null;
  ownerIsContract: boolean | null;
  diamondFacetCount: number | null;
  implementationProxiableUUID: string | null;
  implementationCodeHash: string | null;
  beaconImplementation: string | null;
  adminOwner: string | null;
  beaconOwner: string | null;
}

export async function readHookFacts(
  client: PublicClient,
  hooks: readonly string[],
  blockNumber: bigint,
  log: (msg: string) => void = () => {},
): Promise<Map<string, HookFacts>> {
  const out = new Map<string, HookFacts>();
  let done = 0;
  await mapLimit(hooks, CONCURRENCY, async (hook) => {
    const address = hook as Address;
    const [code, implementationSlot, adminSlot, beaconSlot] = await Promise.all([
      mustRead(() => client.getCode({ address, blockNumber })),
      mustRead(() => client.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT, blockNumber })),
      mustRead(() => client.getStorageAt({ address, slot: EIP1967_ADMIN_SLOT, blockNumber })),
      mustRead(() => client.getStorageAt({ address, slot: EIP1967_BEACON_SLOT, blockNumber })),
    ]);
    const hasCode = code !== undefined && code !== "0x";
    const facts: HookFacts = {
      address: hook,
      code: hasCode ? code : null,
      codeSize: hasCode ? (code.length - 2) / 2 : 0,
      codeHash: hasCode ? keccak256(code) : null,
      implementationSlot: implementationSlot ?? null,
      adminSlot: adminSlot ?? null,
      beaconSlot: beaconSlot ?? null,
      owner: null,
      ownerIsContract: null,
      diamondFacetCount: null,
      implementationProxiableUUID: null,
      implementationCodeHash: null,
      beaconImplementation: null,
      adminOwner: null,
      beaconOwner: null,
    };

    if (hasCode) {
      const [owner, facets] = await Promise.all([
        tryRead(() => client.readContract({ address, abi: OWNABLE_ABI, functionName: "owner", blockNumber })),
        tryRead(() =>
          client.readContract({ address, abi: DIAMOND_LOUPE_ABI, functionName: "facetAddresses", blockNumber }),
        ),
      ]);
      facts.owner = owner && owner !== NATIVE_CURRENCY ? owner : null;
      facts.diamondFacetCount = facets ? facets.length : null;

      const impl = slotToAddress(facts.implementationSlot) as Address | null;
      const admin = slotToAddress(facts.adminSlot) as Address | null;
      const beacon = slotToAddress(facts.beaconSlot) as Address | null;
      const [uuid, implCode, adminOwner, beaconImpl, beaconOwner, ownerCode] = await Promise.all([
        impl ? tryRead(() => client.readContract({ address: impl, abi: UUPS_ABI, functionName: "proxiableUUID", blockNumber })) : null,
        impl ? mustRead(() => client.getCode({ address: impl, blockNumber })) : undefined,
        admin ? tryRead(() => client.readContract({ address: admin, abi: OWNABLE_ABI, functionName: "owner", blockNumber })) : null,
        beacon ? tryRead(() => client.readContract({ address: beacon, abi: BEACON_ABI, functionName: "implementation", blockNumber })) : null,
        beacon ? tryRead(() => client.readContract({ address: beacon, abi: OWNABLE_ABI, functionName: "owner", blockNumber })) : null,
        facts.owner ? mustRead(() => client.getCode({ address: facts.owner as Address, blockNumber })) : undefined,
      ]);
      facts.implementationProxiableUUID = uuid ?? null;
      facts.implementationCodeHash = implCode && implCode !== "0x" ? keccak256(implCode) : null;
      facts.adminOwner = adminOwner && adminOwner !== NATIVE_CURRENCY ? adminOwner : null;
      facts.beaconImplementation = beaconImpl ?? null;
      facts.beaconOwner = beaconOwner && beaconOwner !== NATIVE_CURRENCY ? beaconOwner : null;
      if (facts.owner) facts.ownerIsContract = ownerCode !== undefined && ownerCode !== "0x";
    }

    out.set(hook, facts);
    if (++done % 50 === 0 || done === hooks.length) log(`  hook facts ${done}/${hooks.length}`);
  });
  return out;
}

export async function readPoolStates(
  client: PublicClient,
  poolIds: readonly string[],
  blockNumber: bigint,
  log: (msg: string) => void = () => {},
): Promise<Map<string, PoolState | null>> {
  const out = new Map<string, PoolState | null>();
  let done = 0;
  await mapLimit(poolIds, CONCURRENCY, async (poolId) => {
    const id = poolId as Hex;
    const [slot0, liquidity] = await Promise.all([
      tryRead(() => client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [id], blockNumber })),
      tryRead(() => client.readContract({ address: STATE_VIEW, abi: STATE_VIEW_ABI, functionName: "getLiquidity", args: [id], blockNumber })),
    ]);
    out.set(
      poolId,
      slot0 && liquidity !== null
        ? {
            sqrtPriceX96: slot0[0].toString(),
            tick: slot0[1],
            protocolFee: slot0[2],
            lpFee: slot0[3],
            liquidity: liquidity.toString(),
          }
        : null,
    );
    if (++done % 250 === 0 || done === poolIds.length) log(`  pool states ${done}/${poolIds.length}`);
  });
  return out;
}

export interface TokenMeta {
  symbol: string | null;
  decimals: number | null;
}

export function sanitizeSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Printable ASCII only, so a hostile token name cannot inject control characters into the CLI or UI.
  const s = raw.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 32);
  return s.length > 0 ? s : null;
}

export async function readTokenMeta(
  client: PublicClient,
  tokens: readonly string[],
  blockNumber: bigint,
  log: (msg: string) => void = () => {},
): Promise<Map<string, TokenMeta>> {
  const out = new Map<string, TokenMeta>();
  let done = 0;
  await mapLimit(tokens, CONCURRENCY, async (token) => {
    if (token.toLowerCase() === NATIVE_CURRENCY) {
      out.set(token, { symbol: "ETH", decimals: 18 });
      return;
    }
    const address = token as Address;
    const [symbol, decimals] = await Promise.all([
      tryRead(() => client.readContract({ address, abi: ERC20_ABI, functionName: "symbol", blockNumber })),
      tryRead(() => client.readContract({ address, abi: ERC20_ABI, functionName: "decimals", blockNumber })),
    ]);
    let sym = sanitizeSymbol(symbol);
    if (sym === null) {
      const b32 = await tryRead(() =>
        client.readContract({ address, abi: ERC20_SYMBOL_BYTES32_ABI, functionName: "symbol", blockNumber }),
      );
      sym = b32 ? sanitizeSymbol(hexToString(b32, { size: 32 }).replace(/\0+$/, "")) : null;
    }
    out.set(token, { symbol: sym, decimals: decimals ?? null });
    if (++done % 250 === 0 || done === tokens.length) log(`  tokens ${done}/${tokens.length}`);
  });
  return out;
}
