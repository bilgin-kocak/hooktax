// Intro and the Uniswap v4 chapter: cold open, title, every hook from the chain, measured take, worst case proved.
import React from "react";
import { AbsoluteFill } from "remotion";
import { Box, CodeChip, Counter, Panel, Pill, Scene, rise } from "./components";
import { BrowserFrame } from "./browser";
import { Capture } from "./components";
import { Terminal } from "./terminal";
import { C, CHAPTER_COLOR, MONO, SANS } from "./theme";
import { S, clamp01, easeInOut, easeOut, pop, ramp, w, windowed } from "./time";
import data from "./data.json";
import demoRun from "./demo-run.json";
import hook676e from "../public/capture/hook676e.json";

const short = (a: string, n = 4) => `${a.slice(0, 2 + n)}…${a.slice(-n)}`;

/* ---------------------------------------------------------------- 1. cold open */
const NODE_Y = 610;
const Node: React.FC<{ x: number; label: string; sub: string; style?: React.CSSProperties }> = ({ x, label, sub, style }) => (
  <div style={{ position: "absolute", left: x - 160, top: NODE_Y - 70, width: 320, height: 140, borderRadius: 22, background: C.panel, border: `2px solid ${C.line}`,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SANS, ...style }}>
    <div style={{ fontSize: 40, fontWeight: 700, color: C.fg }}>{label}</div>
    <div style={{ fontSize: 24, color: C.muted, marginTop: 4 }}>{sub}</div>
  </div>
);

export const Cold: React.FC<{ t: number }> = ({ t }) => {
  const [a] = S.cold;
  const tHook = w("cold", "hook");
  const tCode = w("cold", "code");
  const tCut = w("cold", "cut");
  const tSome2 = w("cold", "some", 1);
  const tTomorrow = w("cold", "tomorrow");
  const hookIn = pop(t, tHook - 0.25, 0.6);
  const hookY = 300 - (1 - clamp01(hookIn)) * 420;
  const danger = ramp(t, tSome2, tSome2 + 0.5);
  const glitch = t > tSome2 ? Math.sin(t * 61) * 3 * (1 - ramp(t, tTomorrow + 0.4, tTomorrow + 1.2)) : 0;
  const dots = Array.from({ length: 16 }, (_, i) => {
    const p = ((t - a) * 0.3 + i / 16) % 1;
    const taken = t > tCut - 0.6 && i % 4 === 1;
    let x = 300 + p * 1320;
    let y = NODE_Y;
    let o = ramp(t, a + 0.3, a + 0.9);
    if (taken && p > 0.5) {
      const q = easeOut((p - 0.5) / 0.22);
      x = 960;
      y = NODE_Y - q * (NODE_Y - 300);
      o *= 1 - ramp(p, 0.68, 0.72);
    }
    return { x, y, o, taken };
  });
  return (
    <Scene name="cold" t={t}>
      <div style={{ position: "absolute", left: 300, top: NODE_Y - 2, width: 1320, height: 4, background: C.line, opacity: ramp(t, a + 0.2, a + 0.8) }} />
      {t > tHook && <div style={{ position: "absolute", left: 958, top: hookY + 70, width: 4, height: Math.max(0, NODE_Y - 70 - (hookY + 70)), background: danger > 0 ? C.warn : C.accent, opacity: clamp01(hookIn) }} />}
      {dots.map((d, i) => (
        <div key={i} style={{ position: "absolute", left: d.x - 11, top: d.y - 11, width: 22, height: 22, borderRadius: 11, opacity: d.o,
          background: d.taken && d.y < NODE_Y - 1 ? C.warn : C.accent, boxShadow: `0 0 16px ${d.taken && d.y < NODE_Y - 1 ? C.warn : C.accent}` }} />
      ))}
      <div style={rise(t, a + 0.25)}><Node x={300} label="You" sub="the swapper" /></div>
      <div style={rise(t, a + 0.45)}><Node x={960} label="PoolManager" sub="Uniswap v4" /></div>
      <div style={rise(t, a + 0.65)}><Node x={1620} label="LPs" sub="liquidity" /></div>
      {t > tHook - 0.25 && (
        <div style={{ position: "absolute", left: 960 - 170 + glitch, top: hookY - 70, width: 340, height: 140, borderRadius: 22,
          background: danger > 0 ? C.warnBg : C.infoBg, border: `3px solid ${danger > 0 ? C.warn : C.accent}`,
          boxShadow: `0 0 ${30 + 20 * Math.sin(t * 5) * ramp(t, tCode, tCode + 0.3)}px ${danger > 0 ? C.warn : C.accent}66`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SANS }}>
          <div style={{ fontSize: 26, color: C.muted, letterSpacing: 2 }}>HOOK</div>
          <div style={{ fontFamily: MONO, fontSize: 38, color: danger > 0 ? C.warn : C.fg, marginTop: 4 }}>
            {t > tSome2 && Math.floor(t * 8) % 3 !== 0 ? "{ v2 ? }" : "{ code }"}
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 1150, top: 250, ...rise(t, tCut - 0.1), fontFamily: SANS, fontSize: 34, fontWeight: 700, color: C.warn }}>takes a cut</div>
      <div style={{ position: "absolute", left: 1150, top: 300, ...rise(t, tTomorrow - 0.2), fontFamily: SANS, fontSize: 30, color: C.warn, opacity: 0.9 }}>…and could change tomorrow</div>
    </Scene>
  );
};

/* ---------------------------------------------------------------- 2. title */
export const Title: React.FC<{ t: number }> = ({ t }) => {
  const [a] = S.title;
  const k = pop(t, a + 0.1, 0.7);
  const q1 = w("title", "what");
  const q2 = w("title", "and");
  const Row: React.FC<{ at: number; tag: string; tone: [string, string]; q: string; note: string }> = ({ at, tag, tone, q, note }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 28, ...rise(t, at - 0.15) }}>
      <Pill color={tone[0]} bg={tone[1]} style={{ fontSize: 28, width: 190, textAlign: "center" }}>{tag}</Pill>
      <div style={{ fontFamily: SANS, fontSize: 46, fontWeight: 600, color: C.fg, width: 820 }}>{q}</div>
      <div style={{ fontFamily: SANS, fontSize: 26, color: C.muted, width: 420 }}>{note}</div>
    </div>
  );
  return (
    <Scene name="title" t={t}>
      <AbsoluteFill style={{ alignItems: "center", fontFamily: SANS }}>
        <div style={{ marginTop: 200, fontSize: 168, fontWeight: 800, letterSpacing: -4, color: C.fg, transform: `scale(${0.9 + 0.1 * k})`, opacity: clamp01(k * 1.5) }}>
          Hook<span style={{ color: C.warn }}>Tax</span>
        </div>
        <div style={{ fontSize: 38, color: C.muted, marginTop: 4, ...rise(t, a + 0.8) }}>know what a hook can take, before you trade</div>
        <div style={{ marginTop: 90, display: "flex", flexDirection: "column", gap: 34 }}>
          <Row at={q1} tag="Today" tone={[C.ok, C.okBg]} q="What does its hook take from me?" note="measured take: real swaps on a mainnet fork" />
          <Row at={q2} tag="Tomorrow" tone={[C.warn, C.warnBg]} q="What could it take?" note="capability ceiling: address bits, proxy slots, fee flag" />
        </div>
        <div style={{ position: "absolute", bottom: 150, display: "flex", gap: 40, fontSize: 30, color: C.muted, ...rise(t, a + 1.2) }}>
          {(["Uniswap v4", "Arkiv", "Chainlink CRE"] as const).map((p) => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 12, height: 12, borderRadius: 6, background: CHAPTER_COLOR[p] }} />{p}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

/* ---------------------------------------------------------------- 3. every hook, from the chain */
const FLAGS: Array<[number, string, string]> = [
  [13, "before", "Initialize"], [12, "after", "Initialize"], [11, "beforeAdd", "Liquidity"], [10, "afterAdd", "Liquidity"],
  [9, "beforeRemove", "Liquidity"], [8, "afterRemove", "Liquidity"], [7, "before", "Swap"], [6, "after", "Swap"],
  [5, "before", "Donate"], [4, "after", "Donate"], [3, "beforeSwap", "ReturnsDelta"], [2, "afterSwap", "ReturnsDelta"],
  [1, "afterAddLiq", "ReturnsDelta"], [0, "afterRemoveLiq", "ReturnsDelta"],
];
const DELTA_BITS = [3, 2, 1, 0];

const HookCard: React.FC<{ t: number; x: number; at: number; bitsAt: number; proxyAt: number; worstAt: number; address: string; sub: string; bits: number;
  proxy: [string, string, string]; worst: [string, string, string] }> = ({ t, x, at, bitsAt, proxyAt, worstAt, address, sub, bits, proxy, worst }) => {
  const tail = address.slice(-4);
  const glow = ramp(t, bitsAt - 0.8, bitsAt - 0.3);
  return (
    <Panel style={{ position: "absolute", left: x, top: 150, width: 860, padding: "26px 28px", ...rise(t, at) }}>
      <div style={{ fontFamily: MONO, fontSize: 25, color: C.fg }}>
        {address.slice(0, -4)}<span style={{ color: C.warn, background: `rgba(242,196,103,${0.22 * glow})`, borderRadius: 4, padding: "0 2px" }}>{tail}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 24, color: C.muted, marginTop: 6 }}>{sub}</div>
      <div style={{ fontFamily: SANS, fontSize: 24, color: C.fg, marginTop: 22 }}>
        permission bits = the address's last 14 bits: <span style={{ fontFamily: MONO, color: C.warn }}>0x{bits.toString(16).padStart(4, "0")}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 106px)", gap: 8, marginTop: 14 }}>
        {FLAGS.map(([bit, l1, l2], i) => {
          const on = (bits >> bit) & 1;
          const lit = on ? ramp(t, bitsAt + i * 0.05, bitsAt + i * 0.05 + 0.25) : 0;
          const col = DELTA_BITS.includes(bit) ? C.warn : C.accent;
          return (
            <div key={bit} style={{ height: 88, borderRadius: 10, padding: "6px 4px", textAlign: "center", fontFamily: SANS, fontSize: 14.5, lineHeight: "17px",
              border: `1.5px solid ${lit ? col : C.line}`, background: lit ? `${col}2e` : "#16140f", color: lit ? C.fg : C.faint, opacity: ramp(t, at + 0.2 + i * 0.03, at + 0.5 + i * 0.03) }}>
              <div style={{ fontFamily: MONO, fontSize: 15, color: lit ? col : C.faint }}>{bit} · {on}</div>
              <div style={{ marginTop: 6 }}>{l1}</div>
              <div>{l2}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24, fontFamily: SANS, fontSize: 26, ...rise(t, proxyAt) }}>
        <span style={{ color: C.muted, width: 150 }}>proxy slots</span>
        <Pill color={proxy[1]} bg={proxy[2]} style={{ fontSize: 24 }}>{proxy[0]}</Pill>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16, fontFamily: SANS, fontSize: 26, ...rise(t, worstAt) }}>
        <span style={{ color: C.muted, width: 150 }}>worst case</span>
        <Pill color={worst[1]} bg={worst[2]} style={{ fontSize: 24 }}>{worst[0]}</Pill>
      </div>
    </Panel>
  );
};

export const Chain: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.chain;
  const tLog = w("chain", "initialize") - 0.3;
  const tPools = w("chain", "187000");
  const tHooked = w("chain", "47000");
  const tHooks = w("chain", "11242");
  const tB = w("chain", "permissions") - 0.9;
  const tWritten = w("chain", "written");
  const tDecodes = w("chain", "decodes");
  const tProxy = w("chain", "proxy");
  const tWorst = w("chain", "worst");
  const partA = 1 - ramp(t, tB - 0.4, tB);
  const rowH = 46;
  const offset = Math.max(0, t - tLog) * 1.25;
  const first = Math.floor(offset);
  return (
    <Scene name="chain" t={t}>
      {t < tB && (
        <AbsoluteFill style={{ opacity: partA }}>
          <Panel style={{ position: "absolute", left: 90, top: 150, width: 1010, height: 760, overflow: "hidden", ...rise(t, a + 0.1) }}>
            <div style={{ padding: "22px 26px 14px", borderBottom: `1px solid ${C.line}`, fontFamily: SANS }}>
              <div style={{ fontSize: 26, color: C.fg, fontWeight: 600 }}>PoolManager <span style={{ fontFamily: MONO, fontSize: 22, color: C.accent }}>0x000000000004444c5dc75cB358380D2e3dE08A90</span></div>
              <div style={{ fontFamily: MONO, fontSize: 16.5, color: C.muted, marginTop: 8 }}>event Initialize(id, currency0, currency1, fee, tickSpacing, hooks, sqrtPriceX96, tick)</div>
            </div>
            <div style={{ display: "flex", padding: "10px 26px", fontFamily: SANS, fontSize: 19, color: C.faint, borderBottom: `1px solid ${C.line}` }}>
              <span style={{ width: 150 }}>block</span><span style={{ width: 250 }}>pool id</span><span style={{ width: 120 }}>fee</span><span style={{ width: 120 }}>tick sp.</span><span>hooks</span>
            </div>
            <div style={{ position: "relative", height: 600, overflow: "hidden" }}>
              {data.events.slice(first, first + 14).map((e, i) => {
                const y = (i - (offset - first)) * rowH;
                const appear = ramp(t, tLog + (first + i) / 1.25 - 0.4, tLog + (first + i) / 1.25);
                return (
                  <div key={first + i} style={{ position: "absolute", top: y, left: 0, right: 0, height: rowH, display: "flex", alignItems: "center", padding: "0 26px",
                    fontFamily: MONO, fontSize: 20, color: C.fg, opacity: Math.min(1, 0.62 + appear), borderBottom: `1px solid ${C.line}55` }}>
                    <span style={{ width: 150, color: C.muted }}>{e.block.toLocaleString("en-US")}</span>
                    <span style={{ width: 250 }}>{short(e.id, 6)}</span>
                    <span style={{ width: 120 }}>{e.fee}</span>
                    <span style={{ width: 120 }}>{e.tickSpacing}</span>
                    <span style={{ color: C.warn }}>{short(e.hooks, 6)}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
          <div style={{ position: "absolute", left: 1170, top: 190, width: 660, fontFamily: SANS }}>
            {([[tPools, 186872, "v4 pools initialized", C.fg, 92], [tHooked, 47130, "with a hook", C.fg, 92], [tHooks, 11242, "unique hooks", C.warn, 132]] as const).map(([at, v, label, col, size], i) => (
              <div key={i} style={{ marginBottom: 34, ...rise(t, at - 0.15) }}>
                <div style={{ fontSize: size, fontWeight: 800, color: col, letterSpacing: -2, lineHeight: 1 }}><Counter t={t} at={at - 0.1} value={v} dur={0.9} /></div>
                <div style={{ fontSize: 34, color: C.muted, marginTop: 6 }}>{label}</div>
              </div>
            ))}
            <div style={{ fontSize: 24, color: C.faint, ...rise(t, tHooks + 0.6) }}>Ethereum mainnet · blocks 21,688,329 → 26,347,887<br />read-only JSON-RPC · no Etherscan, no Sourcify</div>
          </div>
        </AbsoluteFill>
      )}
      {t >= tB - 0.4 && (
        <AbsoluteFill style={{ opacity: ramp(t, tB - 0.4, tB) }}>
          <HookCard t={t} x={80} at={tB} bitsAt={tWritten + 0.9} proxyAt={tProxy} worstAt={tWorst} address="0x676E38B66A7547FF685549E4Ad88134aC62200cC"
            sub="a real mainnet hook · 240 pools" bits={0x00cc} proxy={["none detected", C.info, C.infoBg]} worst={["code-bound: limited to today's code", C.info, C.infoBg]} />
          <HookCard t={t} x={980} at={tDecodes - 0.2} bitsAt={tDecodes + 0.2} proxyAt={tProxy + 0.5} worstAt={tWorst + 0.5} address="0x9E34C7439F63D8aE7C63822E513BA6388D2E0088"
            sub="SneakyFeeHook · our planted hook, on a local fork" bits={0x0088} proxy={["EIP-1967 slot set → UUPS → upgradeable", C.risk, C.riskBg]}
            worst={["up to 100% of swap value", C.risk, C.riskBg]} />
        </AbsoluteFill>
      )}
      <CodeChip t={t} at={a + 0.6} until={tB} path="packages/indexer/src/pools.ts:23" note="decode Initialize" />
      <CodeChip t={t} at={tB + 0.2} until={tProxy - 0.1} path="packages/core/src/permissions.ts:35" note="14 permission bits" />
      <CodeChip t={t} at={tProxy} until={tWorst - 0.1} path="packages/core/src/proxy.ts" note="EIP-1967 / UUPS / beacon" />
      <CodeChip t={t} at={tWorst} until={b} path="packages/core/src/capabilities.ts:38" note="worstCase()" />
    </Scene>
  );
};

/* ---------------------------------------------------------------- 4. measured take today */
const fmt = (v: number, token: string) => {
  const s = Math.abs(v) >= 1000 ? Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 }) : Math.abs(v).toFixed(6);
  return `${v < 0 ? "−" : "+"}${s} ${token}`;
};
const ROLE: Record<string, [string, string]> = { swapper: ["Swapper", C.fg], "pool-manager": ["PoolManager", C.accent], hook: ["Hook", C.warn] };

const Ledger: React.FC<{ t: number; x: number; at: number; title: string; dir: (typeof data.trace.directions)[number]; pmAt: number; takeLabel: string }> = ({ t, x, at, title, dir, pmAt, takeLabel }) => {
  const byRole = ["swapper", "pool-manager", "hook"].map((role) => ({ role, flows: dir.flows.filter((f) => f.role === role) }));
  return (
    <Panel style={{ position: "absolute", left: x, top: 300, width: 830, padding: "24px 28px", ...rise(t, at) }}>
      <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 700, color: C.fg }}>{title}</div>
      {byRole.map(({ role, flows }, i) => {
        const [label, col] = ROLE[role];
        const isPm = role === "pool-manager";
        const isHook = role === "hook";
        return (
          <div key={role} style={{ display: "flex", alignItems: "flex-start", gap: 18, marginTop: 22, padding: "12px 14px", borderRadius: 12,
            background: isHook ? `rgba(242,196,103,${0.12 + 0.1 * ramp(t, at + 1.2, at + 1.6)})` : isPm ? `rgba(141,156,255,${0.12 * windowed(t, pmAt, pmAt + 2.6)})` : "transparent",
            ...rise(t, at + 0.35 + i * 0.3) }}>
            <div style={{ width: 190 }}>
              <div style={{ fontFamily: SANS, fontSize: 28, fontWeight: 700, color: col }}>{label}</div>
              <div style={{ fontFamily: MONO, fontSize: 18, color: C.muted }}>{short(flows[0].address, 4)}</div>
            </div>
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 25, lineHeight: "36px" }}>
              {flows.map((f, k) => <div key={k} style={{ color: f.amount < 0 ? C.risk : C.ok }}>{fmt(f.amount, f.token)}</div>)}
            </div>
            {isHook && <Pill color="#16140f" bg={C.warn} style={{ fontSize: 24, alignSelf: "center" }}>{takeLabel}</Pill>}
          </div>
        );
      })}
    </Panel>
  );
};

export const Measured: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.measured;
  const tSwaps = w("measured", "swaps");
  const tBoth = w("measured", "both");
  const tPm = w("measured", "poolmanager");
  const tTraces = w("measured", "traces");
  const tThis = w("measured", "this");
  const tWhile = w("measured", "while");
  const tCap = tThis - 0.15;
  const t0 = tCap - 1.4;
  const scrollEnd = t0 + hook676e.marks.measurements;
  const [d1, d2] = data.trace.directions;
  return (
    <Scene name="measured" t={t}>
      {t < tCap && (
        <AbsoluteFill style={{ opacity: 1 - ramp(t, tCap - 0.35, tCap) }}>
          <div style={{ position: "absolute", left: 110, top: 150, fontFamily: SANS, ...rise(t, a + 0.15) }}>
            <div style={{ fontSize: 50, fontWeight: 700, color: C.fg }}>One real swap, measured on a mainnet fork</div>
            <div style={{ fontSize: 27, color: C.muted, marginTop: 10 }}>
              fork block 26,347,887 · pool <span style={{ fontFamily: MONO }}>{short(data.trace.poolId, 4)}</span> ({data.trace.pair}) · hook <span style={{ fontFamily: MONO }}>{short(data.trace.hook, 4)}</span>
            </div>
          </div>
          <Ledger t={t} x={110} at={tSwaps - 0.2} title={`${d1.tokenIn} → ${d1.tokenOut} · about $50 in`} dir={d1} pmAt={tPm} takeLabel={`take ${(d1.takeBps / 100).toFixed(2)}%`} />
          <Ledger t={t} x={980} at={tBoth - 0.1} title={`${d2.tokenIn} → ${d2.tokenOut} · the other direction`} dir={d2} pmAt={tPm} takeLabel={`take ${(d2.takeBps / 100).toFixed(2)}%`} />
          <div style={{ position: "absolute", left: 110, top: 840, display: "flex", gap: 18, fontFamily: SANS, fontSize: 26 }}>
            {["ERC-20 Transfer logs", "ERC-6909 claims", "native ETH (state diff)", "LP fee from the Swap event"].map((s, i) => (
              <div key={s} style={rise(t, tTraces + i * 0.18)}><Pill color={C.info} bg={C.infoBg} style={{ fontSize: 25 }}>{s}</Pill></div>
            ))}
          </div>
        </AbsoluteFill>
      )}
      {t >= tCap - 0.35 && (
        <AbsoluteFill style={{ opacity: ramp(t, tCap - 0.35, tCap) }}>
          <BrowserFrame t={t} url="bilgin-kocak.github.io/hooktax/#/hook/0x676E38B66A7547FF685549E4Ad88134aC62200cC">
            <Capture name="hook676e" t={t} t0={t0} clipDuration={hook676e.duration} from={1.0} until={b} />
            <Box t={t} at={tThis} until={tWhile - 0.05} x={180} y={412} w={1560} h={60} label="measured take today: 0.9999%" />
            <Box t={t} at={tWhile} until={t0 + 5.6} x={180} y={474} w={1560} h={56} color={C.info} label="LP fee: 0%" labelSide="bottom" />
            <Box t={t} at={scrollEnd + 0.1} until={b} x={156} y={232} w={1608} h={62} color={C.ok} label="the SimResult on Arkiv (expires after 7 days)" labelSide="bottom" />
          </BrowserFrame>
        </AbsoluteFill>
      )}
      <CodeChip t={t} at={tSwaps} until={tCap} path="packages/sim/test/utils/TakeMeter.sol:101" note="measureSwap" />
      <CodeChip t={t} at={tCap + 0.3} until={b} path="apps/web/src/components/HookView.tsx" note="reads Arkiv" />
    </Scene>
  );
};

/* ---------------------------------------------------------------- 5. worst case, proved */
export const Worst: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.worst;
  const runAt = a + 1.0;
  const runEnd = runAt + demoRun.chunks[demoRun.chunks.length - 1].t;
  const W = (s: string, n = 0) => w("worst", s, n);
  const hl = [
    { from: W("upgradeable") - 0.15, until: W("and", 0) + 0.05, lines: [26], color: C.warn },
    { from: W("and", 0) + 0.05, until: W("from") - 0.05, lines: [25], color: C.warn },
    { from: W("from"), until: W("today") - 0.05, lines: [28, 29], color: C.risk },
    { from: W("today"), until: W("then") - 0.05, lines: [31, 32, 33], color: C.ok },
    { from: W("then"), until: W("and", 1) - 0.05, lines: [35, 36], color: C.warn },
    { from: W("and", 1), until: W("hooktax", 1) - 0.05, lines: [38, 39, 40], color: C.risk },
    { from: W("hooktax", 1), until: b, lines: [45, 46], color: C.risk },
  ];
  return (
    <Scene name="worst" t={t}>
      <Terminal t={t} x={120} y={110} w={1680} h={835} title="make demo  —  ~/hooktax" command="make demo" typeAt={a + 0.3} runAt={runAt}
        chunks={demoRun.chunks} fontSize={19} lineHeight={25.5} scrollTo={{ at: runEnd + 0.5, line: 22, dur: 1.0 }} highlights={hl}
        badge={<Pill color={C.ok} bg={C.okBg} style={{ fontSize: 20 }}>local mainnet fork · nothing is broadcast</Pill>} />
      <CodeChip t={t} at={a + 0.6} until={W("today") - 0.1} path="packages/sim/test/SneakyFeeHookDemo.t.sol:51" note="mine the address, prove the upgrade" />
      <CodeChip t={t} at={W("today")} until={b} path="packages/sim/src/SneakyFeeHook.sol" note="UUPS · v1 0.3% → v2 100%" />
    </Scene>
  );
};

export { easeInOut };
