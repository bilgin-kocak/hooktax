// Parse TakeMeter's line output (test/utils/TakeMeter.sol) into SimResultRecords.
//   HOOK|hook|bits|implementation|proxiableUUID|owner|forkBlock      (demo preflight)
//   POOL|poolId|sqrtPriceX96
//   SWAP|poolId|scenario|zeroForOne|status|tokenIn|tokenOut|amountIn|amountOut|takeValueIn|takeBpsX100|lpFeePips|swapper|router|revertData
//   FLOW|poolId|scenario|zeroForOne|account|token|kind|amount
//   UPGRADE|fromImplementation|toImplementation
//   PROBE|poolId|hook|method|caller|executed|revertData                (real-hook upgrade probes)

import {
  POOL_MANAGER,
  probeOutcome,
  type DirectionResult,
  type FlowRole,
  type ProbeAttempt,
  type SimResultRecord,
  type SimStatus,
  type ValueFlow,
} from "@hooktax/core";

export interface ParsedSwap {
  poolId: string;
  scenario: string;
  zeroForOne: boolean;
  status: SimStatus;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  takeValueIn: string;
  takeBpsX100: number;
  lpFeePips: number;
  swapper: string;
  router: string;
  revertData: string;
  flows: Array<{ account: string; token: string; kind: number; amount: string }>;
}

export interface ParsedRun {
  hook?: { address: string; bits: number; implementation: string; proxiableUUID: string; owner: string; forkBlock: number };
  pools: Array<{ poolId: string; sqrtPriceX96: string }>;
  swaps: ParsedSwap[];
  upgrades: Array<{ from: string; to: string }>;
  probes: Array<{ poolId: string; hook: string; method: string; caller: string; executed: boolean; revertData: string }>;
}

const KINDS = ["erc20", "native", "erc6909"] as const;

export function parseLines(text: string): ParsedRun {
  const run: ParsedRun = { pools: [], swaps: [], upgrades: [], probes: [] };
  const key = (p: string, s: string, z: string) => `${p.toLowerCase()}|${s}|${z}`;
  const swapsByKey = new Map<string, ParsedSwap>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split("|");
    switch (f[0]) {
      case "HOOK":
        run.hook = { address: f[1]!, bits: Number(f[2]), implementation: f[3]!, proxiableUUID: f[4]!, owner: f[5]!, forkBlock: Number(f[6]) };
        break;
      case "POOL":
        run.pools.push({ poolId: f[1]!.toLowerCase(), sqrtPriceX96: f[2]! });
        break;
      case "UPGRADE":
        run.upgrades.push({ from: f[1]!, to: f[2]! });
        break;
      case "PROBE":
        run.probes.push({ poolId: f[1]!.toLowerCase(), hook: f[2]!, method: f[3]!, caller: f[4]!, executed: f[5] === "true", revertData: f[6] ?? "0x" });
        break;
      case "SWAP": {
        const s: ParsedSwap = {
          poolId: f[1]!.toLowerCase(),
          scenario: f[2]!,
          zeroForOne: f[3] === "true",
          status: f[4] as SimStatus,
          tokenIn: f[5]!,
          tokenOut: f[6]!,
          amountIn: f[7]!,
          amountOut: f[8]!,
          takeValueIn: f[9]!,
          takeBpsX100: Number(f[10]),
          lpFeePips: Number(f[11]),
          swapper: f[12]!,
          router: f[13]!,
          revertData: f[14] ?? "0x",
          flows: [],
        };
        run.swaps.push(s);
        swapsByKey.set(key(s.poolId, s.scenario, f[3]!), s);
        break;
      }
      case "FLOW": {
        const s = swapsByKey.get(key(f[1]!, f[2]!, f[3]!));
        if (s) s.flows.push({ account: f[4]!, token: f[5]!, kind: Number(f[6]), amount: f[7]! });
        break;
      }
    }
  }
  return run;
}

export interface PoolContext {
  hook: string;
  hookOwner: string | null;
}

export function roleOf(account: string, s: ParsedSwap, ctx: PoolContext): FlowRole {
  const a = account.toLowerCase();
  if (a === s.swapper.toLowerCase() || a === s.router.toLowerCase()) return "swapper";
  if (a === POOL_MANAGER.toLowerCase()) return "pool-manager";
  if (a === ctx.hook.toLowerCase()) return "hook";
  if (ctx.hookOwner && a === ctx.hookOwner.toLowerCase()) return "hook-owner";
  return "other";
}

const STATUS_ORDER: SimStatus[] = ["ok", "hook-reverted", "swap-failed", "no-liquidity", "unsupported-token", "error", "not-run"];

export function toSimRecords(
  run: ParsedRun,
  opts: {
    forkBlock: number;
    measuredAt: number;
    isDemo: boolean;
    context: (poolId: string) => PoolContext;
    labels?: Record<string, string>;
    notes?: (poolId: string, scenario: string) => string[];
  },
): SimResultRecord[] {
  const groups = new Map<string, ParsedSwap[]>();
  for (const s of run.swaps) {
    const k = `${s.poolId}|${s.scenario}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: SimResultRecord[] = [];
  for (const [k, swaps] of groups) {
    const [poolId, scenario] = k.split("|") as [string, string];
    const ctx = opts.context(poolId);
    const directions: DirectionResult[] = swaps.map((s) => {
      const ok = s.status === "ok";
      const flows: ValueFlow[] = s.flows
        .filter((f) => f.amount !== "0")
        .map((f) => ({
          address: f.account,
          role: roleOf(f.account, s, ctx),
          token: f.token,
          amount: f.amount,
          kind: KINDS[f.kind] ?? "erc20",
        }));
      return {
        zeroForOne: s.zeroForOne,
        status: s.status,
        error: ok ? null : s.revertData && s.revertData !== "0x" ? s.revertData.slice(0, 202) : null,
        tokenIn: s.tokenIn,
        tokenOut: s.tokenOut,
        amountIn: s.amountIn,
        amountOut: s.amountOut,
        takeAmountIn: s.takeValueIn,
        takeBps: ok ? s.takeBpsX100 / 100 : null,
        lpFeeBps: ok ? s.lpFeePips / 100 : null,
        flows,
      };
    });
    const h = headlineTake(directions);
    out.push({
      simId: `${poolId}:${scenario}:${opts.forkBlock}`,
      poolId,
      hook: ctx.hook,
      scenario,
      ...(opts.labels?.[scenario] ? { label: opts.labels[scenario] } : {}),
      isDemo: opts.isDemo,
      forkBlock: opts.forkBlock,
      measuredAt: opts.measuredAt,
      status: h.status,
      measuredTakeBps: h.measuredTakeBps,
      lpFeeBps: h.lpFeeBps,
      directions,
      notes: [...(opts.notes?.(poolId, scenario) ?? []), ...h.notes],
    });
  }
  return out;
}

/** A take above this (100% of input) cannot be a cut of the swapper's own money. */
export const TAKE_CAP_BPS = 10_000;

/**
 * The headline numbers of one scenario from its directions. Pure, so a stored result can be
 * re-derived when this rule changes (runner/rederive.ts).
 *
 * With both sides sized to ~$50, a take above 100% of input is not a plain swap cut: a third party
 * (e.g. a fee-on-transfer token paying out its accumulated tax inside the swap) received more than
 * the swapper paid in this tx. We keep its flows but do not let it set the headline take, and note it.
 */
export function headlineTake(directions: readonly DirectionResult[]): {
  status: SimStatus;
  measuredTakeBps: number | null;
  lpFeeBps: number | null;
  notes: string[];
} {
  const okDirs = directions.filter((d) => d.status === "ok");
  const reliableDirs = okDirs.filter((d) => (d.takeBps ?? 0) <= TAKE_CAP_BPS);
  const notes: string[] = [];
  for (const d of okDirs) {
    if ((d.takeBps ?? 0) > TAKE_CAP_BPS) {
      notes.push(
        `${d.zeroForOne ? "zeroForOne" : "oneForZero"}: measured take ${(d.takeBps! / 100).toFixed(1)}% exceeds 100% of input; attribution is unreliable for this swap (see flows), excluded from the headline take`,
      );
    }
  }
  const status: SimStatus = okDirs.length > 0
    ? "ok"
    : [...directions].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))[0]?.status ?? "error";
  return {
    status,
    measuredTakeBps: reliableDirs.length ? Math.max(...reliableDirs.map((d) => d.takeBps ?? 0)) : null,
    lpFeeBps: okDirs.length ? Math.max(...okDirs.map((d) => d.lpFeeBps ?? 0)) : null,
    notes,
  };
}

/**
 * Real-hook upgrade probes (test/ProbeUpgrade.t.sol): "today" records, plus one
 * "after-admin-upgrade" record per probed pool. When an upgrade executed it is a measured result;
 * when none did it is status "not-run" with no take (never a zero), so the card says
 * "not demonstrated (tried: ...)". Every attempt is kept in `probes`.
 */
export function toProbeRecords(
  run: ParsedRun,
  opts: { forkBlock: number; measuredAt: number; hookByPool: ReadonlyMap<string, string>; ownerByHook: ReadonlyMap<string, string | null> },
): SimResultRecord[] {
  const context = (poolId: string): PoolContext => {
    const hook = opts.hookByPool.get(poolId.toLowerCase()) ?? "";
    return { hook, hookOwner: opts.ownerByHook.get(hook.toLowerCase()) ?? null };
  };
  const probesByPool = new Map<string, ProbeAttempt[]>();
  for (const p of run.probes) {
    const list = probesByPool.get(p.poolId) ?? [];
    list.push({ method: p.method, caller: p.caller, executed: p.executed, ...(p.revertData && p.revertData !== "0x" ? { revertData: p.revertData } : {}) });
    probesByPool.set(p.poolId, list);
  }
  const measured = toSimRecords(run, { forkBlock: opts.forkBlock, measuredAt: opts.measuredAt, isDemo: false, context });
  const out: SimResultRecord[] = [];
  for (const r of measured) {
    if (r.scenario !== "after-admin-upgrade") {
      out.push(r);
      continue;
    }
    const probes = probesByPool.get(r.poolId) ?? [];
    const used = probes.find((p) => p.executed);
    out.push({
      ...r,
      ...(used ? { label: `authority upgrade (${used.method})` } : {}),
      probes,
      notes: [
        ...(r.notes ?? []),
        `fork only: impersonated ${used?.caller ?? "the upgrade authority"} and pointed the proxy at TakeAllImplementation, which takes 100% through the hook's own RETURNS_DELTA bits, minted as PoolManager claims to a fresh address`,
      ],
    });
  }
  const withUpgrade = new Set(out.filter((r) => r.scenario === "after-admin-upgrade").map((r) => r.poolId));
  for (const [poolId, probes] of probesByPool) {
    if (withUpgrade.has(poolId)) continue;
    out.push({
      simId: `${poolId}:after-admin-upgrade:${opts.forkBlock}`,
      poolId,
      hook: context(poolId).hook,
      scenario: "after-admin-upgrade",
      isDemo: false,
      forkBlock: opts.forkBlock,
      measuredAt: opts.measuredAt,
      status: "not-run",
      measuredTakeBps: null,
      lpFeeBps: null,
      directions: [],
      probes,
      notes: [`upgrade not demonstrated on the fork: ${probes.map(probeOutcome).join("; ")}`],
    });
  }
  return out;
}

/**
 * Which stored results a `today` re-measure of `pools` at `forkBlock` supersedes: only those pools'
 * non-demo "today" results at that block. Demonstrations (e.g. "after-admin-upgrade" from
 * `make probe`) are different measurements and are never dropped by a re-measure.
 */
export function supersededByMeasure(forkBlock: number, pools: ReadonlySet<string>) {
  return (r: Pick<SimResultRecord, "poolId" | "scenario" | "forkBlock" | "isDemo">): boolean =>
    !r.isDemo && r.scenario === "today" && r.forkBlock === forkBlock && pools.has(r.poolId);
}
