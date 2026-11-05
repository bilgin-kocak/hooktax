// Resolve a pool id or hook address against the local dataset and build the HookTax card inputs.
// Pure (no fs, no network), so it is unit-testable.

import {
  buildCard,
  type Card,
  type CardSim,
  type HookRecord,
  type PoolRecord,
  type SimResultRecord,
} from "@hooktax/core";

const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const HEX64 = /^0x[0-9a-fA-F]{64}$/;

export type Target =
  | { kind: "hook"; address: string }
  | { kind: "pool"; poolId: string }
  | { kind: "invalid"; input: string };

export function classifyTarget(input: string): Target {
  const s = input.trim();
  if (HEX40.test(s)) return { kind: "hook", address: s.toLowerCase() };
  if (HEX64.test(s)) return { kind: "pool", poolId: s.toLowerCase() };
  return { kind: "invalid", input: s };
}

export interface Dataset {
  hooks: HookRecord[];
  pools: PoolRecord[];
  sims: SimResultRecord[];
  snapshotBlock: number;
}

export interface CheckResult {
  hook: HookRecord;
  pool: PoolRecord | null;
  card: Card;
  /** Latest live, non-demo "today" sim used for the card, if any. */
  today: SimResultRecord | null;
  /** Non-"today" demonstrations (e.g. after an admin upgrade) for this hook. */
  demonstrations: SimResultRecord[];
}

const toCardSim = (r: SimResultRecord): CardSim => ({
  scenario: r.scenario,
  status: r.status,
  measuredTakeBps: r.measuredTakeBps,
  lpFeeBps: r.lpFeeBps,
  forkBlock: r.forkBlock,
  measuredAt: r.measuredAt,
  label: r.label ?? null,
});

/** Latest by measuredAt. */
function latest<T extends { measuredAt: number }>(rs: T[]): T | null {
  return rs.reduce<T | null>((a, b) => (!a || b.measuredAt > a.measuredAt ? b : a), null);
}

export function check(target: Target, data: Dataset): CheckResult | { error: string } {
  if (target.kind === "invalid") return { error: `not a pool id (32-byte hex) or hook address (20-byte hex): ${target.input}` };

  let hook: HookRecord | undefined;
  let pool: PoolRecord | null = null;
  if (target.kind === "pool") {
    pool = data.pools.find((p) => p.poolId.toLowerCase() === target.poolId) ?? null;
    if (!pool) return { error: `pool ${target.poolId} is not in the dataset (only hooked pools are indexed)` };
    hook = data.hooks.find((h) => h.address.toLowerCase() === pool!.hooks.toLowerCase());
  } else {
    hook = data.hooks.find((h) => h.address.toLowerCase() === target.address);
  }
  if (!hook) return { error: `hook not found in the dataset` };

  // Sims for this hook, optionally narrowed to the pool, and only this snapshot's/newer ok ones.
  const forHook = data.sims.filter((s) => s.hook.toLowerCase() === hook!.address.toLowerCase());
  const scoped = pool ? forHook.filter((s) => s.poolId.toLowerCase() === pool!.poolId.toLowerCase()) : forHook;
  const todays = scoped.filter((s) => s.scenario === "today" && s.status === "ok" && s.measuredTakeBps !== null);
  const today = latest(todays.length ? todays : scoped.filter((s) => s.scenario === "today"));
  const demonstrations = scoped.filter((s) => s.scenario !== "today");

  const card = buildCard({
    hook: {
      address: hook.address,
      permissions: hook.permissions,
      isUpgradeable: hook.isUpgradeable,
      hasDynamicFeePool: hook.hasDynamicFeePool,
      proxyType: hook.proxy.type,
    },
    today: today ? toCardSim(today) : null,
    demonstrations: demonstrations.map(toCardSim),
    poolFeePips: pool ? pool.fee : null,
  });
  return { hook, pool, card, today, demonstrations };
}

/** The arkiv_query text that fetches the same hook from Arkiv (shown so results are verifiable). */
export function arkivQueryFor(hook: HookRecord, writer: string): string {
  return `arkiv.schema = str('hooktax.v1.hook') AND $owner = addr(${writer}) AND hook = addr(${hook.address})`;
}
