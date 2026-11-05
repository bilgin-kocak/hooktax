import { describe, expect, it } from "vitest";
import { INITIALIZE_TOPIC0 } from "@hooktax/core";
import fixtures from "./fixtures/initialize-logs.json";
import { decodeInitializeLog, groupByHook, hasHook } from "../src/pools";

// Real mainnet logs fetched with eth_getLogs (see docs/testing.md).
describe("decodeInitializeLog (real mainnet fixtures)", () => {
  it("topic0 in live logs equals keccak of the canonical signature", () => {
    expect(fixtures.hookless.topics[0]).toBe(INITIALIZE_TOPIC0);
    expect(fixtures.hooked.topics[0]).toBe(INITIALIZE_TOPIC0);
  });

  it("decodes the first v4 pool ever (ETH/USDC 0.05%, no hook)", () => {
    const p = decodeInitializeLog(fixtures.hookless);
    expect(p).toMatchObject({
      poolId: "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27",
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      fee: 500,
      isDynamicFee: false,
      tickSpacing: 10,
      hooks: "0x0000000000000000000000000000000000000000",
      tick: 195388,
      blockNumber: 21688545,
    });
    expect(BigInt(p.sqrtPriceX96)).toBe(0x4449d40969b3d337975ed199f72cn);
    expect(hasHook(p)).toBe(false);
  });

  it("decodes the first hooked pool (WETH/USDT, hook bits 0xc0)", () => {
    const p = decodeInitializeLog(fixtures.hooked);
    expect(p).toMatchObject({
      currency0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      currency1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      fee: 100,
      tickSpacing: 1,
      blockNumber: 21714864,
    });
    expect(p.hooks.toLowerCase()).toBe("0xa6c8d7514785c4314ee05ed566cb41151d43c0c0");
    expect(hasHook(p)).toBe(true);
  });

  it("groups hooked pools by hook and ignores hookless pools", () => {
    const a = decodeInitializeLog(fixtures.hookless);
    const b = decodeInitializeLog(fixtures.hooked);
    const b2 = { ...b, poolId: "0xbeef", blockNumber: b.blockNumber + 5, isDynamicFee: true };
    const groups = groupByHook([b2, a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pools.map((p) => p.poolId)).toEqual([b.poolId, "0xbeef"]);
    expect(groups[0]!.firstSeenBlock).toBe(b.blockNumber);
    expect(groups[0]!.dynamicFeePoolCount).toBe(1);
  });
});
