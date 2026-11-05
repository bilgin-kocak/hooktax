// Capability rules (spec §3): deterministic, no judgment calls. Each rule is a pure function of
// onchain facts: permission bits (fixed in the hook address), proxy detection, and whether any of
// the hook's pools uses the dynamic-fee flag. See docs/capability-rules.md for the table and the
// one place where we are stricter than the spec's wording.

import { hasLiquidityDeltaPermission, hasSwapDeltaPermission, type HookPermissions } from "./permissions";

export type CapabilityId =
  | "swap-delta"
  | "lp-delta"
  | "dynamic-fee"
  | "upgradeable"
  | "worst-case-swap"
  | "worst-case-lp"
  | "no-swap-cut";

export interface Capability {
  id: CapabilityId;
  text: string;
}

export const CAPABILITY_TEXT: Record<CapabilityId, string> = {
  "swap-delta": "Hook can change how much you receive on swaps",
  "lp-delta": "Hook can change what LPs deposit or withdraw",
  "dynamic-fee": "Fee can change; maximum possible LP fee is 100%",
  upgradeable: "Code can be replaced; ceiling = everything its permission bits allow",
  "worst-case-swap": "Worst case: up to 100% of swap value",
  "worst-case-lp": "Worst case: up to 100% of what LPs deposit or withdraw",
  "no-swap-cut": "Cannot take a cut of swaps through hook logic",
};

export interface CapabilityInput {
  permissions: HookPermissions;
  isUpgradeable: boolean;
  hasDynamicFeePool: boolean;
}

export function computeCapabilities(input: CapabilityInput): Capability[] {
  const swapDelta = hasSwapDeltaPermission(input.permissions);
  const lpDelta = hasLiquidityDeltaPermission(input.permissions);
  const ids: CapabilityId[] = [];
  if (swapDelta) ids.push("swap-delta");
  if (lpDelta) ids.push("lp-delta");
  if (input.hasDynamicFeePool) ids.push("dynamic-fee");
  if (input.isUpgradeable) ids.push("upgradeable");
  // Spec: "Upgradeable and a RETURNS_DELTA bit is set -> up to 100% of swap value". Only the two
  // SWAP delta bits let a hook change swap amounts; liquidity-delta bits never run on swaps. So we
  // split the rule to keep each line true.
  if (input.isUpgradeable && swapDelta) ids.push("worst-case-swap");
  if (input.isUpgradeable && lpDelta) ids.push("worst-case-lp");
  if (!swapDelta && !lpDelta && !input.hasDynamicFeePool && !input.isUpgradeable) {
    ids.push("no-swap-cut");
  }
  return ids.map((id) => ({ id, text: CAPABILITY_TEXT[id] }));
}

/** Headline worst case for a SWAPPER, used for sorting, filtering and the card. */
export type WorstCaseLevel = "swap-100" | "fee-100" | "code-bound" | "none";

export interface WorstCase {
  level: WorstCaseLevel;
  text: string;
  /** Upper bound on value to hook/owner/others, in bps of swap input; null when not bounded by bits alone. */
  maxSwapTakeBps: number | null;
}

export const WORST_CASE_TEXT: Record<WorstCaseLevel, string> = {
  "swap-100": "Up to 100% of swap value: the code can be replaced and it may change swap amounts",
  "fee-100": "The LP fee can be raised to 100%",
  "code-bound": "Can change swap amounts, limited to what the current (non-upgradeable) code does",
  none: "Cannot take a cut of swaps through hook logic",
};

export function worstCase(input: CapabilityInput): WorstCase {
  const swapDelta = hasSwapDeltaPermission(input.permissions);
  let level: WorstCaseLevel;
  if (input.isUpgradeable && swapDelta) level = "swap-100";
  else if (input.hasDynamicFeePool) level = "fee-100";
  else if (swapDelta) level = "code-bound";
  else level = "none";
  const maxSwapTakeBps = level === "swap-100" ? 10_000 : level === "none" ? 0 : null;
  return { level, text: WORST_CASE_TEXT[level], maxSwapTakeBps };
}
