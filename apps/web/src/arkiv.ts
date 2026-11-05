// Every read the page makes goes straight to Arkiv's public RPC from the browser. There is no
// HookTax backend. All queries are scoped to the HookTax writer with .ownedBy(WRITER), because
// Arkiv is a public database and anyone can write entities with our schema names.

import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc, eq, exists, gt } from "@arkiv-network/sdk/query";
import { addr } from "@arkiv-network/sdk/schema";
import { getAddress, hexToString, http, isAddress, type Address, type Hex } from "viem";
import { HookSchema, ImportSchema, PoolSchema, SimResultSchema } from "@hooktax/arkiv/schemas";
import type { HookFlagName } from "@hooktax/core";
import { ACCESS_KEY, PAGE_SIZE, RPC_URL, WRITER } from "./config";

export const client = createPublicClient({
  chain: rabdi({ accessKey: ACCESS_KEY }),
  transport: http(undefined, { retryCount: 3, retryDelay: 1500, timeout: 30_000 }),
});

export const writerAddress = (): Address | null => (isAddress(WRITER) ? getAddress(WRITER) : null);

export interface HookFilter {
  swapDelta: boolean;
  upgradeable: boolean;
  dynamicFee: boolean;
  lpDelta: boolean;
  worstSwap100: boolean;
  active: boolean;
  measured: boolean;
  permissions: HookFlagName[];
  hook: string;
  owner: string;
}

export const EMPTY_FILTER: HookFilter = {
  swapDelta: false,
  upgradeable: false,
  dynamicFee: false,
  lpDelta: false,
  worstSwap100: false,
  active: false,
  measured: false,
  permissions: [],
  hook: "",
  owner: "",
};

export type HookSort = "poolCount" | "activePoolCount" | "lastMeasuredTakeBps" | "firstSeenBlock";

const HOOK_LIST_FIELDS = {
  $key: true,
  $expiresAt: true,
  hook: true,
  permissionBits: true,
  isUpgradeable: true,
  hasDynamicFeePool: true,
  canAffectSwapAmounts: true,
  canAffectLpAmounts: true,
  poolCount: true,
  activePoolCount: true,
  lastMeasuredTakeBps: true,
  worstCase: true,
  proxyType: true,
  status: true,
} as const;

/** The list query for the atlas. Returned unexecuted so the page can show its text. */
export function hookListQuery(f: HookFilter, sort: HookSort, page: number) {
  const writer = writerAddress();
  if (!writer) throw new Error("No writer address configured (VITE_ARKIV_WRITER_ADDRESS or ?writer=)");
  // Each .where() adds a condition that must also hold.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = client.select(HOOK_LIST_FIELDS).from(HookSchema).ownedBy(writer);
  if (f.swapDelta) q = q.where(eq("canAffectSwapAmounts", true));
  if (f.upgradeable) q = q.where(eq("isUpgradeable", true));
  if (f.dynamicFee) q = q.where(eq("hasDynamicFeePool", true));
  if (f.lpDelta) q = q.where(eq("canAffectLpAmounts", true));
  if (f.worstSwap100) q = q.where(eq("worstCase", "swap-100"));
  if (f.active) q = q.where(gt("activePoolCount", 0));
  if (f.measured) q = q.where(exists("lastMeasuredTakeBps"));
  for (const p of f.permissions) q = q.where(eq(p, true));
  if (isAddress(f.hook.trim())) q = q.where(eq("hook", addr(getAddress(f.hook.trim()))));
  if (isAddress(f.owner.trim())) q = q.where(eq("owner", addr(getAddress(f.owner.trim()))));
  return q.orderBy(desc(sort)).limit(PAGE_SIZE).offset(page * PAGE_SIZE).withCount() as {
    toString(): string;
    fetch(): Promise<{ entities: HookListRow[]; count?: bigint; skipped: number; blockNumber: bigint }>;
  };
}

type V<T> = { value: T };
export interface HookListRow {
  $key: Hex;
  $expiresAt: bigint;
  hook: V<Address>;
  permissionBits: V<number>;
  isUpgradeable: V<boolean>;
  hasDynamicFeePool: V<boolean>;
  canAffectSwapAmounts: V<boolean>;
  canAffectLpAmounts: V<boolean>;
  poolCount: V<number>;
  activePoolCount: V<number>;
  lastMeasuredTakeBps?: V<string>;
  worstCase: V<string>;
  proxyType: V<string>;
  status: V<string>;
}

export function hookDetailQuery(hook: Address) {
  const writer = writerAddress()!;
  return client.select().from(HookSchema).ownedBy(writer).where(eq("hook", addr(hook))).limit(1);
}

export function poolsForHookQuery(hook: Address) {
  const writer = writerAddress()!;
  return client.select().from(PoolSchema).ownedBy(writer).where(eq("hook", addr(hook))).orderBy(desc("liquidity")).limit(50);
}

export function simsForHookQuery(hook: Address) {
  const writer = writerAddress()!;
  return client.select().from(SimResultSchema).ownedBy(writer).where(eq("hook", addr(hook))).orderBy(desc("forkBlock")).limit(50);
}

export function demoSimsQuery() {
  const writer = writerAddress()!;
  return client.select().from(SimResultSchema).ownedBy(writer).where(eq("isDemo", true)).orderBy(desc("forkBlock")).limit(50);
}

export function measuredSimsQuery() {
  const writer = writerAddress()!;
  return client
    .select()
    .from(SimResultSchema)
    .ownedBy(writer)
    .where(eq("isDemo", false))
    .where(eq("status", "ok"))
    .orderBy(desc("measuredTakeBps"))
    .limit(50);
}

export function latestImportQuery() {
  const writer = writerAddress()!;
  return client.select().from(ImportSchema).ownedBy(writer).orderBy(desc("toBlock")).limit(1);
}

/** A copy-pasteable curl for any query text (arkiv_query JSON-RPC, no SDK needed). */
export function curlFor(queryText: string, limit = PAGE_SIZE): string {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "arkiv_query",
    params: [queryText, { select: { key: true, attributes: true }, limit: `0x${limit.toString(16)}` }],
  });
  return `curl -s ${RPC_URL} -H 'content-type: application/json' --data '${body.replace(/'/g, "'\\''")}'`;
}

export function decodeDetails<T>(bytesValue: { value: Hex } | undefined): T | null {
  if (!bytesValue) return null;
  try {
    return JSON.parse(hexToString(bytesValue.value)) as T;
  } catch {
    return null;
  }
}
