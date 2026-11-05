import { decodeEventLog, getAddress, parseAbiItem, type Hex } from "viem";
import { DYNAMIC_FEE_FLAG, INITIALIZE_EVENT_SIGNATURE, ZERO_ADDRESS } from "@hooktax/core";
import type { RawLog } from "./logs";

const INITIALIZE_ABI = [parseAbiItem(INITIALIZE_EVENT_SIGNATURE)] as const;

export interface DecodedPool {
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  isDynamicFee: boolean;
  tickSpacing: number;
  /** Checksummed hook address; 0x000…000 means the pool has no hook. */
  hooks: string;
  sqrtPriceX96: string;
  tick: number;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

export function decodeInitializeLog(raw: RawLog): DecodedPool {
  const { args } = decodeEventLog({
    abi: INITIALIZE_ABI,
    eventName: "Initialize",
    data: raw.data as Hex,
    topics: raw.topics as [Hex, ...Hex[]],
    strict: true,
  });
  return {
    poolId: args.id.toLowerCase(),
    currency0: getAddress(args.currency0),
    currency1: getAddress(args.currency1),
    fee: args.fee,
    isDynamicFee: args.fee === DYNAMIC_FEE_FLAG,
    tickSpacing: args.tickSpacing,
    hooks: getAddress(args.hooks),
    sqrtPriceX96: args.sqrtPriceX96.toString(),
    tick: args.tick,
    blockNumber: raw.blockNumber,
    transactionHash: raw.transactionHash,
    logIndex: raw.logIndex,
  };
}

export function hasHook(pool: Pick<DecodedPool, "hooks">): boolean {
  return pool.hooks.toLowerCase() !== ZERO_ADDRESS;
}

export interface HookGroup {
  hook: string;
  pools: DecodedPool[];
  firstSeenBlock: number;
  dynamicFeePoolCount: number;
}

/** Group hooked pools by hook. Pools are kept in chain order. */
export function groupByHook(pools: readonly DecodedPool[]): HookGroup[] {
  const map = new Map<string, DecodedPool[]>();
  for (const p of pools) {
    if (!hasHook(p)) continue;
    const list = map.get(p.hooks) ?? [];
    list.push(p);
    map.set(p.hooks, list);
  }
  return [...map.entries()].map(([hook, list]) => {
    const sorted = [...list].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    return {
      hook,
      pools: sorted,
      firstSeenBlock: sorted[0]!.blockNumber,
      dynamicFeePoolCount: sorted.filter((p) => p.isDynamicFee).length,
    };
  });
}
