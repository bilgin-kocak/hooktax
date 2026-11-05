import { describe, expect, it } from "vitest";
import { EIP1967_IMPLEMENTATION_SLOT } from "@hooktax/core";
import { buildHookRecord, sortHooks, upgradeAuthority } from "../src/build";
import type { HookFacts } from "../src/enrich";
import type { HookGroup } from "../src/pools";
import { sanitizeSymbol } from "../src/enrich";

const word = (addr: string) => "0x" + addr.slice(2).toLowerCase().padStart(64, "0");
const IMPL = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";

function facts(over: Partial<HookFacts> = {}): HookFacts {
  return {
    address: "",
    code: "0x6080",
    codeSize: 2,
    codeHash: "0xabc",
    implementationSlot: "0x" + "0".repeat(64),
    adminSlot: "0x" + "0".repeat(64),
    beaconSlot: "0x" + "0".repeat(64),
    owner: null,
    ownerIsContract: null,
    diamondFacetCount: null,
    implementationProxiableUUID: null,
    implementationCodeHash: null,
    beaconImplementation: null,
    adminOwner: null,
    beaconOwner: null,
    ...over,
  } as HookFacts;
}

function group(hook: string, n = 1, dynamic = 0): HookGroup {
  return {
    hook,
    pools: Array.from({ length: n }, (_, i) => ({
      poolId: `0x${i}`,
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x0000000000000000000000000000000000000001",
      fee: i < dynamic ? 0x800000 : 3000,
      isDynamicFee: i < dynamic,
      tickSpacing: 60,
      hooks: hook,
      sqrtPriceX96: "1",
      tick: 0,
      blockNumber: 100 + i,
      transactionHash: "0x",
      logIndex: 0,
    })),
    firstSeenBlock: 100,
    dynamicFeePoolCount: dynamic,
  };
}

describe("buildHookRecord", () => {
  it("UUPS hook with BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA -> worst case 100% of swap value", () => {
    const hook = "0x0000000000000000000000000000000000000088"; // bits 0x88
    const rec = buildHookRecord(
      group(hook, 3),
      facts({
        implementationSlot: word(IMPL) as `0x${string}`,
        implementationProxiableUUID: EIP1967_IMPLEMENTATION_SLOT,
        owner: OWNER,
      }),
    );
    expect(rec.permissionNames).toEqual(["beforeSwap", "beforeSwapReturnsDelta"]);
    expect(rec.proxy).toMatchObject({ type: "eip1967-uups", upgradeAuthority: OWNER, upgradeAuthoritySource: "owner" });
    expect(rec.isUpgradeable).toBe(true);
    expect(rec.canAffectSwapAmounts).toBe(true);
    expect(rec.capabilities.map((c) => c.id)).toEqual(["swap-delta", "upgradeable", "worst-case-swap"]);
    expect(rec.worstCase.level).toBe("swap-100");
    expect(rec.poolCount).toBe(3);
    expect(rec.status).toBe("ok");
  });

  it("plain hook with no code -> status no-code, no proxy", () => {
    const rec = buildHookRecord(group("0x00000000000000000000000000000000000000c0"), facts({ code: null, codeSize: 0, codeHash: null }));
    expect(rec.status).toBe("no-code");
    expect(rec.proxy.type).toBe("none-detected");
    expect(rec.capabilities.map((c) => c.id)).toEqual(["no-swap-cut"]);
  });

  it("dynamic-fee pool flags the hook", () => {
    const rec = buildHookRecord(group("0x00000000000000000000000000000000000000c0", 2, 1), facts());
    expect(rec.hasDynamicFeePool).toBe(true);
    expect(rec.dynamicFeePoolCount).toBe(1);
    expect(rec.capabilities.map((c) => c.id)).toEqual(["dynamic-fee"]);
  });
});

describe("upgradeAuthority", () => {
  it("transparent proxy prefers the ProxyAdmin's owner", () => {
    expect(upgradeAuthority("eip1967-transparent", { owner: null, adminOwner: OWNER, beaconOwner: null }, IMPL)).toEqual({
      address: OWNER,
      source: "proxy-admin-owner",
    });
    expect(upgradeAuthority("eip1967-transparent", { owner: null, adminOwner: null, beaconOwner: null }, IMPL)).toEqual({
      address: IMPL,
      source: "admin-slot",
    });
  });
  it("not upgradeable -> no authority", () => {
    expect(upgradeAuthority("none-detected", { owner: OWNER, adminOwner: null, beaconOwner: null }, null).address).toBeNull();
  });
});

describe("sortHooks", () => {
  it("orders by pool count desc, then address", () => {
    const a = buildHookRecord(group("0x00000000000000000000000000000000000000c0", 1), facts());
    const b = buildHookRecord(group("0x00000000000000000000000000000000000001c0", 5), facts());
    const c = buildHookRecord(group("0x00000000000000000000000000000000000002c0", 1), facts());
    expect(sortHooks([c, a, b]).map((h) => h.poolCount)).toEqual([5, 1, 1]);
    expect(sortHooks([c, a, b])[1]!.address.toLowerCase()).toBe("0x00000000000000000000000000000000000000c0");
  });
});

describe("sanitizeSymbol", () => {
  it("keeps printable ASCII only and trims", () => {
    expect(sanitizeSymbol("USDC")).toBe("USDC");
    expect(sanitizeSymbol(" W\u0000ETH\n")).toBe("WETH");
    expect(sanitizeSymbol("\u001b[31mRED")).toBe("[31mRED");
    expect(sanitizeSymbol("")).toBeNull();
    expect(sanitizeSymbol(null)).toBeNull();
  });
});
