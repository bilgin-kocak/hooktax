// Assemble HookRecord / PoolRecord from decoded pools and onchain facts. Pure: no RPC.

import { getAddress } from "viem";
import {
  classifyProxy,
  computeCapabilities,
  decodePermissions,
  hasLiquidityDeltaPermission,
  hasSwapDeltaPermission,
  permissionBits,
  permissionNames,
  worstCase,
  type HookProxy,
  type HookRecord,
  type PoolRecord,
  type PoolState,
  type UpgradeAuthoritySource,
} from "@hooktax/core";
import type { HookFacts, TokenMeta } from "./enrich";
import type { DecodedPool, HookGroup } from "./pools";

const checksum = (a: string | null | undefined): string | null => (a ? getAddress(a) : null);

export function upgradeAuthority(
  type: HookProxy["type"],
  facts: Pick<HookFacts, "owner" | "adminOwner" | "beaconOwner">,
  admin: string | null,
): { address: string | null; source: UpgradeAuthoritySource | null } {
  switch (type) {
    case "eip1967-transparent":
      if (facts.adminOwner) return { address: facts.adminOwner, source: "proxy-admin-owner" };
      return { address: admin, source: admin ? "admin-slot" : null };
    case "eip1967-beacon":
      return { address: facts.beaconOwner, source: facts.beaconOwner ? "beacon-owner" : null };
    case "eip1967-uups":
    case "eip1967":
    case "eip2535-diamond":
      return { address: facts.owner, source: facts.owner ? "owner" : null };
    default:
      return { address: null, source: null };
  }
}

export function buildHookRecord(group: HookGroup, facts: HookFacts): HookRecord {
  const bits = permissionBits(group.hook);
  const permissions = decodePermissions(bits);
  const proxy = classifyProxy({
    code: facts.code,
    implementationSlot: facts.implementationSlot,
    adminSlot: facts.adminSlot,
    beaconSlot: facts.beaconSlot,
    implementationProxiableUUID: facts.implementationProxiableUUID,
    beaconImplementation: facts.beaconImplementation,
    diamondFacetCount: facts.diamondFacetCount,
  });
  const authority = upgradeAuthority(proxy.type, facts, proxy.admin);
  const hasDynamicFeePool = group.dynamicFeePoolCount > 0;
  const capInput = { permissions, isUpgradeable: proxy.isUpgradeable, hasDynamicFeePool };

  return {
    address: getAddress(group.hook),
    permissionBits: bits,
    permissions,
    permissionNames: permissionNames(permissions),
    code: { size: facts.codeSize, hash: facts.codeHash },
    proxy: {
      type: proxy.type,
      isUpgradeable: proxy.isUpgradeable,
      implementation: checksum(proxy.implementation),
      implementationCodeHash: facts.implementationCodeHash,
      admin: checksum(proxy.admin),
      beacon: checksum(proxy.beacon),
      upgradeAuthority: checksum(authority.address),
      upgradeAuthoritySource: authority.source,
    },
    owner: checksum(facts.owner),
    ownerIsContract: facts.ownerIsContract,
    poolCount: group.pools.length,
    poolIds: group.pools.map((p) => p.poolId),
    dynamicFeePoolCount: group.dynamicFeePoolCount,
    hasDynamicFeePool,
    firstSeenBlock: group.firstSeenBlock,
    isUpgradeable: proxy.isUpgradeable,
    canAffectSwapAmounts: hasSwapDeltaPermission(permissions),
    canAffectLpAmounts: hasLiquidityDeltaPermission(permissions),
    capabilities: computeCapabilities(capInput),
    worstCase: worstCase(capInput),
    status: facts.codeSize > 0 ? "ok" : "no-code",
  };
}

export function buildPoolRecord(
  p: DecodedPool,
  state: PoolState | null,
  tokens: ReadonlyMap<string, TokenMeta>,
): PoolRecord {
  const t0 = tokens.get(p.currency0);
  const t1 = tokens.get(p.currency1);
  return {
    poolId: p.poolId,
    currency0: p.currency0,
    currency1: p.currency1,
    symbol0: t0?.symbol ?? null,
    symbol1: t1?.symbol ?? null,
    decimals0: t0?.decimals ?? null,
    decimals1: t1?.decimals ?? null,
    fee: p.fee,
    isDynamicFee: p.isDynamicFee,
    tickSpacing: p.tickSpacing,
    hooks: p.hooks,
    initSqrtPriceX96: p.sqrtPriceX96,
    initTick: p.tick,
    blockNumber: p.blockNumber,
    transactionHash: p.transactionHash,
    logIndex: p.logIndex,
    state,
  };
}

/** Deterministic order: most pools first, then address. */
export function sortHooks(hooks: HookRecord[]): HookRecord[] {
  return [...hooks].sort(
    (a, b) => b.poolCount - a.poolCount || a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
  );
}

/** Deterministic order: chain order. */
export function sortPools(pools: PoolRecord[]): PoolRecord[] {
  return [...pools].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}
