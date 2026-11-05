// Parse TakeMeter's line output (test/utils/TakeMeter.sol) into SimResultRecords.
//   HOOK|hook|bits|implementation|proxiableUUID|owner|forkBlock      (demo preflight)
//   POOL|poolId|sqrtPriceX96
//   SWAP|poolId|scenario|zeroForOne|status|tokenIn|tokenOut|amountIn|amountOut|takeValueIn|takeBpsX100|lpFeePips|swapper|router|revertData
//   FLOW|poolId|scenario|zeroForOne|account|token|kind|amount
//   UPGRADE|fromImplementation|toImplementation

import { POOL_MANAGER, type DirectionResult, type FlowRole, type SimResultRecord, type SimStatus, type ValueFlow } from "@hooktax/core";

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
}

const KINDS = ["erc20", "native", "erc6909"] as const;

export function parseLines(text: string): ParsedRun {
  const run: ParsedRun = { pools: [], swaps: [], upgrades: [] };
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
    const okDirs = directions.filter((d) => d.status === "ok");
    // With both sides sized to ~$50, a take above 100% of input is not a plain swap cut: it means
    // a third party (often the hook or owner also acting as LP/arbitrageur) netted more than the
    // swapper paid in this tx. We keep its flows but do not let it set the headline take, and note it.
    const CAP_BPS = 10_000;
    const reliableDirs = okDirs.filter((d) => (d.takeBps ?? 0) <= CAP_BPS);
    const extraNotes: string[] = [];
    for (const d of okDirs) {
      if ((d.takeBps ?? 0) > CAP_BPS) {
        extraNotes.push(
          `${d.zeroForOne ? "zeroForOne" : "oneForZero"}: measured take ${(d.takeBps! / 100).toFixed(1)}% exceeds 100% of input; attribution is unreliable for this swap (see flows), excluded from the headline take`,
        );
      }
    }
    const status: SimStatus = okDirs.length > 0
      ? "ok"
      : [...directions].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))[0]?.status ?? "error";
    out.push({
      simId: `${poolId}:${scenario}:${opts.forkBlock}`,
      poolId,
      hook: ctx.hook,
      scenario,
      ...(opts.labels?.[scenario] ? { label: opts.labels[scenario] } : {}),
      isDemo: opts.isDemo,
      forkBlock: opts.forkBlock,
      measuredAt: opts.measuredAt,
      status,
      measuredTakeBps: reliableDirs.length ? Math.max(...reliableDirs.map((d) => d.takeBps ?? 0)) : null,
      lpFeeBps: okDirs.length ? Math.max(...okDirs.map((d) => d.lpFeeBps ?? 0)) : null,
      directions,
      notes: [...(opts.notes?.(poolId, scenario) ?? []), ...extraNotes],
    });
  }
  return out;
}
