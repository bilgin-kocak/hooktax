import { describe, expect, it } from "vitest";
import { computeCapabilities, worstCase, type CapabilityInput } from "../src/capabilities";
import { decodePermissions } from "../src/permissions";

const BEFORE_SWAP = 1 << 7;
const BEFORE_SWAP_RETURNS_DELTA = 1 << 3;
const AFTER_SWAP_RETURNS_DELTA = 1 << 2;
const AFTER_ADD_LIQUIDITY_RETURNS_DELTA = 1 << 1;
const AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA = 1 << 0;

const input = (bits: number, isUpgradeable = false, hasDynamicFeePool = false): CapabilityInput => ({
  permissions: decodePermissions(bits),
  isUpgradeable,
  hasDynamicFeePool,
});
const ids = (i: CapabilityInput) => computeCapabilities(i).map((c) => c.id);

// One test per row of the spec §3 table.
describe("capability rules (spec §3)", () => {
  it("row 1: BEFORE_SWAP_RETURNS_DELTA or AFTER_SWAP_RETURNS_DELTA -> can change swap amounts", () => {
    expect(ids(input(BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA))).toEqual(["swap-delta"]);
    expect(ids(input(AFTER_SWAP_RETURNS_DELTA))).toEqual(["swap-delta"]);
    expect(computeCapabilities(input(AFTER_SWAP_RETURNS_DELTA))[0]!.text).toBe(
      "Hook can change how much you receive on swaps",
    );
  });

  it("row 2: AFTER_ADD_/REMOVE_LIQUIDITY_RETURNS_DELTA -> can change LP deposits/withdrawals", () => {
    expect(ids(input(AFTER_ADD_LIQUIDITY_RETURNS_DELTA))).toEqual(["lp-delta"]);
    expect(ids(input(AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA))).toEqual(["lp-delta"]);
  });

  it("row 3: dynamic fee pool -> fee can change up to 100%", () => {
    expect(ids(input(BEFORE_SWAP, false, true))).toEqual(["dynamic-fee"]);
    expect(computeCapabilities(input(0, false, true))[0]!.text).toBe(
      "Fee can change; maximum possible LP fee is 100%",
    );
  });

  it("row 4: upgradeable -> code can be replaced", () => {
    expect(ids(input(BEFORE_SWAP, true))).toEqual(["upgradeable"]);
  });

  it("row 5: upgradeable AND swap delta -> worst case 100% of swap value", () => {
    const i = input(BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA, true);
    expect(ids(i)).toEqual(["swap-delta", "upgradeable", "worst-case-swap"]);
    expect(worstCase(i)).toMatchObject({ level: "swap-100", maxSwapTakeBps: 10_000 });
  });

  it("row 5 (stricter): upgradeable AND only liquidity delta -> LP worst case, not swap", () => {
    const i = input(AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA, true);
    expect(ids(i)).toEqual(["lp-delta", "upgradeable", "worst-case-lp"]);
    expect(ids(i)).not.toContain("worst-case-swap");
    expect(worstCase(i).level).toBe("none");
  });

  it("row 6: no delta bits, no dynamic fee, not upgradeable -> cannot take a cut", () => {
    const i = input(BEFORE_SWAP | (1 << 6));
    expect(ids(i)).toEqual(["no-swap-cut"]);
    expect(worstCase(i)).toMatchObject({ level: "none", maxSwapTakeBps: 0 });
  });

  it("row 6 does not apply when any other rule fires", () => {
    expect(ids(input(BEFORE_SWAP, true))).not.toContain("no-swap-cut");
    expect(ids(input(BEFORE_SWAP, false, true))).not.toContain("no-swap-cut");
    expect(ids(input(AFTER_ADD_LIQUIDITY_RETURNS_DELTA))).not.toContain("no-swap-cut");
  });
});

describe("worstCase headline", () => {
  it("dynamic fee without upgradeable swap delta -> fee-100", () => {
    expect(worstCase(input(BEFORE_SWAP, false, true)).level).toBe("fee-100");
  });
  it("swap delta but immutable -> code-bound (unknown bound, measure it)", () => {
    expect(worstCase(input(BEFORE_SWAP_RETURNS_DELTA))).toMatchObject({
      level: "code-bound",
      maxSwapTakeBps: null,
    });
  });
  it("upgradeable swap delta dominates dynamic fee", () => {
    expect(worstCase(input(BEFORE_SWAP_RETURNS_DELTA, true, true)).level).toBe("swap-100");
  });
});
