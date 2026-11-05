// The plain-English "HookTax card" (spec M6), shared by the CLI and the web page.
// Measurement, not accusation: the card states measured numbers, capabilities and worst cases.

import { computeCapabilities, worstCase } from "./capabilities";
import { DYNAMIC_FEE_FLAG } from "./constants";
import { formatBps, formatFee } from "./format";
import type { HookPermissions } from "./permissions";

export interface CardSim {
  scenario: string;
  status: string;
  measuredTakeBps: number | null;
  lpFeeBps: number | null;
  forkBlock: number;
  measuredAt: number;
  label?: string | null;
}

export interface CardInput {
  hook: {
    address: string;
    permissions: HookPermissions;
    isUpgradeable: boolean;
    hasDynamicFeePool: boolean;
    proxyType: string;
  };
  /** Latest live, non-demo "today" measurement for this hook or pool, if any. */
  today?: CardSim | null;
  /** Live measurements of other scenarios (after an admin action on the fork). */
  demonstrations?: CardSim[];
  /** Admin probes that were attempted on the fork but did not execute. */
  notDemonstrated?: string[];
  /** Pool fee from the PoolKey (pips), when the card is about one pool. */
  poolFeePips?: number | null;
}

export type Tone = "ok" | "info" | "warn" | "risk";

export interface CardLine {
  label: string;
  value: string;
  tone: Tone;
}

export interface Card {
  lines: CardLine[];
  capabilities: { id: string; text: string }[];
}

const STATUS_TEXT: Record<string, string> = {
  "hook-reverted": "the hook reverted the swap",
  "no-liquidity": "the pool had no usable liquidity",
  "unsupported-token": "a pool token could not be funded on the fork",
  "swap-failed": "the swap failed",
  "not-run": "not run",
  error: "the simulation errored",
};

export function buildCard(input: CardInput): Card {
  const capInput = {
    permissions: input.hook.permissions,
    isUpgradeable: input.hook.isUpgradeable,
    hasDynamicFeePool: input.hook.hasDynamicFeePool,
  };
  const capabilities = computeCapabilities(capInput);
  const wc = worstCase(capInput);
  const lines: CardLine[] = [];

  const today = input.today ?? null;
  if (today && today.status === "ok" && today.measuredTakeBps !== null) {
    lines.push({
      label: "Measured take today",
      value: `${formatBps(today.measuredTakeBps)} of swap input (worst of both directions, fork block ${today.forkBlock})`,
      tone: today.measuredTakeBps > 0 ? "warn" : "ok",
    });
  } else if (today) {
    lines.push({ label: "Measured take today", value: `not measured: ${STATUS_TEXT[today.status] ?? today.status}`, tone: "info" });
  } else {
    lines.push({
      label: "Measured take today",
      value: "no live measurement (fork results expire after 7 days)",
      tone: "info",
    });
  }

  if (today?.lpFeeBps !== null && today?.lpFeeBps !== undefined) {
    lines.push({ label: "LP fee", value: `${formatBps(today.lpFeeBps)} (paid to liquidity providers, not counted as take)`, tone: "info" });
  } else if (input.poolFeePips !== null && input.poolFeePips !== undefined) {
    lines.push({
      label: "LP fee",
      value: input.poolFeePips === DYNAMIC_FEE_FLAG ? "dynamic (set by the hook)" : formatFee(input.poolFeePips),
      tone: input.poolFeePips === DYNAMIC_FEE_FLAG ? "warn" : "info",
    });
  }

  lines.push({
    label: "Worst case (from onchain facts)",
    value: wc.text,
    tone: wc.level === "swap-100" ? "risk" : wc.level === "none" ? "ok" : "warn",
  });

  const demos = (input.demonstrations ?? []).filter((d) => d.status === "ok" && d.measuredTakeBps !== null);
  if (demos.length > 0) {
    const worst = demos.reduce((a, b) => ((b.measuredTakeBps ?? 0) > (a.measuredTakeBps ?? 0) ? b : a));
    lines.push({
      label: "Demonstrated worst case",
      value: `${formatBps(worst.measuredTakeBps!)} of swap input after "${worst.label ?? worst.scenario}" on the fork`,
      tone: (worst.measuredTakeBps ?? 0) >= 5_000 ? "risk" : "warn",
    });
  } else if ((input.notDemonstrated ?? []).length > 0) {
    lines.push({
      label: "Demonstrated worst case",
      value: `not demonstrated (tried: ${input.notDemonstrated!.join(", ")})`,
      tone: "info",
    });
  } else {
    lines.push({ label: "Demonstrated worst case", value: "not demonstrated", tone: "info" });
  }

  return { lines, capabilities };
}
