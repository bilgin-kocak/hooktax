import { describe, expect, it } from "vitest";
import type { DirectionResult } from "@hooktax/core";
import { headlineTake, TAKE_CAP_BPS } from "./parse";

const dir = (zeroForOne: boolean, takeBps: number | null, lpFeeBps: number | null = 0, status: DirectionResult["status"] = "ok"): DirectionResult => ({
  zeroForOne,
  status,
  error: null,
  tokenIn: "0x1",
  tokenOut: "0x2",
  amountIn: "1",
  amountOut: "1",
  takeAmountIn: "0",
  takeBps,
  lpFeeBps,
  flows: [],
});

describe("headlineTake", () => {
  it("is the worst direction when both are plausible", () => {
    const h = headlineTake([dir(true, 30, 30), dir(false, 29.99, 30)]);
    expect(h).toEqual({ status: "ok", measuredTakeBps: 30, lpFeeBps: 30, notes: [] });
  });

  it("keeps a take of exactly 100%", () => {
    expect(headlineTake([dir(true, TAKE_CAP_BPS), dir(false, 10)]).measuredTakeBps).toBe(10_000);
  });

  it("drops a direction above 100% from the headline and explains why", () => {
    const h = headlineTake([dir(true, 9_264_865.5), dir(false, 120)]);
    expect(h.measuredTakeBps).toBe(120);
    expect(h.notes).toHaveLength(1);
    expect(h.notes[0]).toMatch(/zeroForOne: measured take 92648\.7% exceeds 100% of input/);
  });

  it("has no headline take when every direction is above 100% (real case: pool 0x6fc55403)", () => {
    const h = headlineTake([dir(true, 9_264_865.5), dir(false, 8_281_453.42)]);
    expect(h.status).toBe("ok");
    expect(h.measuredTakeBps).toBeNull();
    expect(h.notes).toHaveLength(2);
  });

  it("reports the most informative failure when no direction ran", () => {
    const h = headlineTake([dir(true, null, null, "swap-failed"), dir(false, null, null, "hook-reverted")]);
    expect(h).toEqual({ status: "hook-reverted", measuredTakeBps: null, lpFeeBps: null, notes: [] });
  });
});
