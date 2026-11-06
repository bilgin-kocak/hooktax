import { describe, expect, it } from "vitest";
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import type { Schema } from "@arkiv-network/sdk/schema";
import { custom, hexToString } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  computeCapabilities,
  decodePermissions,
  permissionNames,
  worstCase,
  type HookRecord,
  type PoolRecord,
  type SimResultRecord,
} from "@hooktax/core";
import { bpsDec, contentHashOf, hookValues, isActivePool, poolValues, samplePoolIds, simResultValues } from "../src/map";
import { HookSchema, ImportSchema, PoolSchema, SimResultSchema } from "../src/schemas";

// A wallet whose transport throws on the first network call. createEntity validates values
// against the schema BEFORE any network call, so reaching the sentinel means "valid".
class NetworkSentinel extends Error {}
const wallet = createWalletClient({
  chain: rabdi({ accessKey: "unit-test" }),
  transport: custom({
    request: async () => {
      throw new NetworkSentinel("network reached");
    },
  }),
  account: privateKeyToAccount(generatePrivateKey()),
});

async function expectValid(schema: Schema, values: Record<string, unknown>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wallet.createEntity(schema as any, values as any, { expiration: ExpirationTime.fromDays(1) });
  } catch (err) {
    let e: unknown = err;
    for (let i = 0; e && i < 20; i++) {
      if (e instanceof NetworkSentinel) return;
      e = (e as { cause?: unknown }).cause;
    }
    throw err;
  }
  throw new Error("expected the sentinel");
}

const HOOK_ADDR = "0x0000fe59823933ac763611a69c88f91d45f81888";
function hook(over: Partial<HookRecord> = {}): HookRecord {
  const permissions = decodePermissions(HOOK_ADDR);
  const capIn = { permissions, isUpgradeable: true, hasDynamicFeePool: false };
  return {
    address: "0x0000fE59823933AC763611a69c88F91d45F81888",
    permissionBits: 0x1888,
    permissions,
    permissionNames: permissionNames(permissions),
    code: { size: 23325, hash: "0xABCDEF0000000000000000000000000000000000000000000000000000000001" },
    proxy: {
      type: "eip1967-uups",
      isUpgradeable: true,
      implementation: "0x1111111111111111111111111111111111111111",
      implementationCodeHash: null,
      admin: null,
      beacon: null,
      upgradeAuthority: "0x9a8FEe232DCF73060Af348a1B62Cdb0a19852d13",
      upgradeAuthoritySource: "owner",
    },
    owner: "0x9a8FEe232DCF73060Af348a1B62Cdb0a19852d13",
    ownerIsContract: true,
    poolCount: 2,
    poolIds: ["0xaa", "0xbb"],
    dynamicFeePoolCount: 0,
    hasDynamicFeePool: false,
    firstSeenBlock: 21_700_000,
    isUpgradeable: true,
    canAffectSwapAmounts: true,
    canAffectLpAmounts: false,
    capabilities: computeCapabilities(capIn),
    worstCase: worstCase(capIn),
    status: "ok",
    ...over,
  };
}

const POOL: PoolRecord = {
  poolId: "0xdf6c45ce7ee049d6ad2fb392188c53205f2ddd79cbe9ad6487d38c6530ccff5a",
  currency0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  currency1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  symbol0: "WETH",
  symbol1: "USDT",
  decimals0: 18,
  decimals1: 6,
  fee: 100,
  isDynamicFee: false,
  tickSpacing: 1,
  hooks: "0xa6C8D7514785c4314EE05ED566CB41151D43c0C0",
  initSqrtPriceX96: "56022336297946759972152",
  initTick: -283256,
  blockNumber: 21714864,
  transactionHash: "0x750739fbdd88a063baf00ef01d0b229a8e73db8aa3db2249c05a77074fb42e02",
  logIndex: 244,
  state: { sqrtPriceX96: "1", tick: 0, protocolFee: 0, lpFee: 100, liquidity: "69297002" },
};

describe("hookValues", () => {
  it("passes the SDK's schema validation", async () => {
    await expectValid(HookSchema, hookValues(hook(), { activePoolCount: 1, samplePoolIds: ["0xaa"], lastMeasuredTakeBps: 30 }));
  });

  it("omits optional columns when facts are missing (no owner, no code)", async () => {
    const v = hookValues(hook({ owner: null, code: { size: 0, hash: null } }), { activePoolCount: 0, samplePoolIds: [] });
    expect("owner" in v).toBe(false);
    expect("codeHash" in v).toBe(false);
    expect("lastMeasuredTakeBps" in v).toBe(false);
    await expectValid(HookSchema, v);
  });

  it("stores the code hash as lowercase hex and details as JSON bytes", () => {
    const v = hookValues(hook(), { activePoolCount: 1, samplePoolIds: ["0xaa"] });
    expect(v.codeHash).toBe("0xabcdef0000000000000000000000000000000000000000000000000000000001");
    const details = JSON.parse(hexToString((v.details as { value: `0x${string}` }).value));
    expect(details.proxy.upgradeAuthority).toBe("0x9a8FEe232DCF73060Af348a1B62Cdb0a19852d13");
    expect(details.samplePoolIds).toEqual(["0xaa"]);
  });

  it("content hash is stable and changes when a fact changes", () => {
    const a = hookValues(hook(), { activePoolCount: 1, samplePoolIds: [] });
    const b = hookValues(hook(), { activePoolCount: 1, samplePoolIds: [] });
    const c = hookValues(hook({ poolCount: 3 }), { activePoolCount: 1, samplePoolIds: [] });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).not.toBe(c.contentHash);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("poolValues / simResultValues", () => {
  it("pool passes validation and flags liquidity", async () => {
    const v = poolValues(POOL, { hook: hook() });
    expect(v.hasLiquidity).toBe(true);
    expect(v.poolId).toBe(POOL.poolId);
    await expectValid(PoolSchema, v);
    expect(isActivePool(POOL)).toBe(true);
    expect(isActivePool({ ...POOL, state: { ...POOL.state!, liquidity: "0" } })).toBe(false);
  });

  it("sim result passes validation", async () => {
    const r: SimResultRecord = {
      simId: `${POOL.poolId}:today:23000000`,
      poolId: POOL.poolId,
      hook: POOL.hooks,
      scenario: "today",
      isDemo: false,
      forkBlock: 23_000_000,
      measuredAt: 1_793_000_000,
      status: "ok",
      measuredTakeBps: 30,
      lpFeeBps: 1,
      directions: [
        {
          zeroForOne: true,
          status: "ok",
          error: null,
          tokenIn: POOL.currency0,
          tokenOut: POOL.currency1,
          amountIn: "1000",
          amountOut: "990",
          takeAmountIn: "3",
          takeBps: 30,
          lpFeeBps: 1,
          flows: [],
        },
      ],
    };
    const v = simResultValues(r);
    expect(v.takeZeroForOneBps).toEqual({ type: "dec", value: "30" });
    expect("takeOneForZeroBps" in v).toBe(false);
    await expectValid(SimResultSchema, v);

    // The content hash changes when a re-derivation changes the headline (e.g. take -> null).
    expect(v.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(simResultValues(r).contentHash).toBe(v.contentHash);
    const rederived = simResultValues({ ...r, measuredTakeBps: null, notes: ["excluded"] });
    expect(rederived.contentHash).not.toBe(v.contentHash);
    expect("measuredTakeBps" in rederived).toBe(false);
    await expectValid(SimResultSchema, rederived);
  });
});

describe("helpers and schema limits", () => {
  it("bpsDec formats to at most 4 decimals", () => {
    expect(bpsDec(30)).toBe("30");
    expect(bpsDec(0.12345)).toBe("0.1235");
    expect(bpsDec(10000)).toBe("10000");
    expect(() => bpsDec(Number.NaN)).toThrow();
  });

  it("samplePoolIds puts active pools first", () => {
    const pools = new Map<string, PoolRecord>([
      ["0xaa", { ...POOL, poolId: "0xaa", state: { ...POOL.state!, liquidity: "0" } }],
      ["0xbb", { ...POOL, poolId: "0xbb" }],
    ]);
    expect(samplePoolIds(hook(), pools)).toEqual(["0xbb", "0xaa"]);
  });

  it("every schema fits Arkiv's 31-column / 32-byte-name limits", () => {
    for (const s of [HookSchema, PoolSchema, SimResultSchema, ImportSchema]) {
      const names = Object.keys(s.columns);
      expect(names.length).toBeLessThanOrEqual(31);
      for (const n of names) expect(new TextEncoder().encode(n).length).toBeLessThanOrEqual(32);
    }
  });

  it("contentHashOf is key-order independent", () => {
    expect(contentHashOf({ a: 1, b: 2n })).toBe(contentHashOf({ b: 2n, a: 1 }));
  });
});
