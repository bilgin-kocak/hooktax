import { describe, expect, it } from "vitest";
import {
  ALL_HOOK_FLAGS_MASK,
  HOOK_FLAGS,
  decodePermissions,
  encodePermissions,
  hasLiquidityDeltaPermission,
  hasSwapDeltaPermission,
  permissionBits,
  permissionLabel,
  permissionNames,
} from "../src/permissions";

// Low 14 bits all set: 0x3fff.
const ALL_FLAGS = "0x0000000000000000000000000000000000003fff";
// Non-zero address with all 14 permission bits clear (0xc000 keeps bits 14-15 set, outside the mask).
const ZERO_FLAGS = "0x123456789012345678901234567890123456c000";

describe("permissionBits", () => {
  it("reads only the low 14 bits", () => {
    expect(permissionBits(ALL_FLAGS)).toBe(0x3fff);
    expect(permissionBits(ZERO_FLAGS)).toBe(0);
    expect(permissionBits("0xffffffffffffffffffffffffffffffffffffffff")).toBe(ALL_HOOK_FLAGS_MASK);
  });

  it("rejects non-addresses", () => {
    expect(() => permissionBits("0x1234")).toThrow();
    expect(() => permissionBits("hello")).toThrow();
  });
});

describe("decodePermissions", () => {
  it("all-flags address sets all 14 permissions", () => {
    const p = decodePermissions(ALL_FLAGS);
    expect(Object.values(p).every(Boolean)).toBe(true);
    expect(permissionNames(p)).toHaveLength(14);
    expect(hasSwapDeltaPermission(p)).toBe(true);
    expect(hasLiquidityDeltaPermission(p)).toBe(true);
  });

  it("zero-flags address sets none", () => {
    const p = decodePermissions(ZERO_FLAGS);
    expect(Object.values(p).some(Boolean)).toBe(false);
    expect(permissionNames(p)).toEqual([]);
    expect(hasSwapDeltaPermission(p)).toBe(false);
    expect(hasLiquidityDeltaPermission(p)).toBe(false);
  });

  it.each(HOOK_FLAGS.map((f) => [f.name, f.bit] as const))(
    "single flag %s maps to bit %i only",
    (name, bit) => {
      const addr = "0x" + (1 << bit).toString(16).padStart(40, "0");
      const p = decodePermissions(addr);
      expect(permissionNames(p)).toEqual([name]);
    },
  );

  it("matches the v4-core bit layout (BEFORE_INITIALIZE = 1<<13 ... AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA = 1<<0)", () => {
    expect(HOOK_FLAGS.map((f) => f.bit)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(permissionLabel("beforeInitialize")).toBe("BEFORE_INITIALIZE");
    expect(permissionLabel("afterRemoveLiquidityReturnsDelta")).toBe(
      "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA",
    );
  });

  it("decodes a real mainnet hook (bits 0x1888)", () => {
    // Most-used hook in the first 1M blocks after the PoolManager deployed.
    const p = decodePermissions("0x0000fe59823933ac763611a69c88f91d45f81888");
    expect(permissionNames(p)).toEqual([
      "afterInitialize",
      "beforeAddLiquidity",
      "beforeSwap",
      "beforeSwapReturnsDelta",
    ]);
    expect(hasSwapDeltaPermission(p)).toBe(true);
  });

  it("swap vs liquidity delta helpers are independent", () => {
    expect(hasSwapDeltaPermission(decodePermissions(1 << 3))).toBe(true); // beforeSwapReturnsDelta
    expect(hasSwapDeltaPermission(decodePermissions(1 << 2))).toBe(true); // afterSwapReturnsDelta
    expect(hasSwapDeltaPermission(decodePermissions(0b11))).toBe(false);
    expect(hasLiquidityDeltaPermission(decodePermissions(1 << 1))).toBe(true);
    expect(hasLiquidityDeltaPermission(decodePermissions(1 << 0))).toBe(true);
    expect(hasLiquidityDeltaPermission(decodePermissions(0b1100))).toBe(false);
  });

  it("encode is the inverse of decode for every mask", () => {
    for (let bits = 0; bits <= ALL_HOOK_FLAGS_MASK; bits++) {
      expect(encodePermissions(decodePermissions(bits))).toBe(bits);
    }
  });

  it("rejects out-of-range masks", () => {
    expect(() => decodePermissions(0x4000)).toThrow();
    expect(() => decodePermissions(-1)).toThrow();
  });
});
