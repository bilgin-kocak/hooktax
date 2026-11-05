import { describe, expect, it } from "vitest";
import { buildCard } from "../src/card";
import { decodePermissions } from "../src/permissions";

const hook = (bits: number, isUpgradeable = false, hasDynamicFeePool = false) => ({
  address: "0x0000000000000000000000000000000000000088",
  permissions: decodePermissions(bits),
  isUpgradeable,
  hasDynamicFeePool,
  proxyType: isUpgradeable ? "eip1967-uups" : "none-detected",
});

const sim = (scenario: string, take: number | null, status = "ok") => ({
  scenario,
  status,
  measuredTakeBps: take,
  lpFeeBps: 30,
  forkBlock: 100,
  measuredAt: 1,
  label: scenario === "today" ? null : "admin upgrade to v2",
});

describe("buildCard", () => {
  it("SneakyFeeHook story: 0.3% today, 100% demonstrated, worst case from facts is 100%", () => {
    const card = buildCard({
      hook: hook(0x88, true),
      today: sim("today", 30),
      demonstrations: [sim("after-admin-upgrade", 10_000)],
    });
    const byLabel = Object.fromEntries(card.lines.map((l) => [l.label, l]));
    expect(byLabel["Measured take today"]!.value).toMatch(/^0\.3% of swap input/);
    expect(byLabel["LP fee"]!.value).toMatch(/^0\.3%/);
    expect(byLabel["Worst case (from onchain facts)"]!.tone).toBe("risk");
    expect(byLabel["Demonstrated worst case"]!.value).toMatch(/^100% of swap input after "admin upgrade to v2"/);
    expect(card.capabilities.map((c) => c.id)).toEqual(["swap-delta", "upgradeable", "worst-case-swap"]);
  });

  it("no live measurement says so plainly", () => {
    const card = buildCard({ hook: hook(0xc0) });
    expect(card.lines[0]!.value).toMatch(/no live measurement/);
    expect(card.lines.at(-1)!.value).toBe("not demonstrated");
  });

  it("failed simulation is an explicit status, never a zero", () => {
    const card = buildCard({ hook: hook(0xc0), today: sim("today", null, "hook-reverted") });
    expect(card.lines[0]!.value).toBe("not measured: the hook reverted the swap");
  });

  it("lists probes that did not execute", () => {
    const card = buildCard({ hook: hook(0x88, true), notDemonstrated: ["upgradeToAndCall", "setFee"] });
    expect(card.lines.at(-1)!.value).toBe("not demonstrated (tried: upgradeToAndCall, setFee)");
  });

  it("dynamic pool fee is shown as dynamic", () => {
    const card = buildCard({ hook: hook(0x80, false, true), poolFeePips: 0x800000 });
    expect(card.lines.find((l) => l.label === "LP fee")!.value).toBe("dynamic (set by the hook)");
  });
});
