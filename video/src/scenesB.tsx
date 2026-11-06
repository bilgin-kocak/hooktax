// The real-hook proof, the Arkiv chapter, the Chainlink CRE chapter and the close.
import React from "react";
import { AbsoluteFill } from "remotion";
import { BrowserFrame } from "./browser";
import { Box, Capture, CodeChip, Counter, Panel, Pill, Scene, rise } from "./components";
import { Terminal } from "./terminal";
import { C, CHAPTER_COLOR, MONO, SANS } from "./theme";
import { S, clamp01, easeInOut, easeOut, pop, ramp, w, windowed } from "./time";
import atlas from "../public/capture/atlas.json";
import atlasQuery from "../public/capture/atlas-query.json";
import hook7074 from "../public/capture/hook7074.json";

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* ---------------------------------------------------------------- 6. on real hooks */
const FunnelRow: React.FC<{ t: number; at: number; y: number; n: number; of: number; text: string; color: string; still?: boolean }> = ({ t, at, y, n, of, text, color, still }) => {
  const k = still ? 1 : easeOut(ramp(t, at, at + 0.6));
  return (
    <div style={{ position: "absolute", left: 230, top: y, width: 1460, opacity: still ? 1 : ramp(t, at - 0.1, at + 0.25) }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 30, fontFamily: SANS }}>
        <div style={{ width: 170, fontSize: 104, fontWeight: 800, color, letterSpacing: -3, textAlign: "right", lineHeight: 1 }}>{still ? n : <Counter t={t} at={at} value={n} dur={0.5} />}</div>
        <div style={{ fontSize: 36, color: C.fg }}>{text}</div>
      </div>
      <div style={{ marginLeft: 200, marginTop: 10, height: 10, borderRadius: 5, background: C.line }}>
        <div style={{ width: `${(100 * n * k) / of}%`, height: 10, borderRadius: 5, background: color }} />
      </div>
    </div>
  );
};

export const Real: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.real;
  const tCap = w("real", "for") - 0.15;
  const tC = w("real", "where") - 0.2;
  const t0 = tCap - 1.25;
  const tInto = w("real", "into");
  const rows = (stillTop: boolean) => (
    <>
      <FunnelRow t={t} at={w("real", "35")} y={150} n={35} of={35} color={C.risk} still={stillTop} text="mainnet hooks: upgradeable and can change swap amounts" />
      <FunnelRow t={t} at={w("real", "24")} y={320} n={24} of={35} color={C.warn} still={stillTop} text="had a pool we could swap through on a fork" />
    </>
  );
  return (
    <Scene name="real" t={t}>
      {t < tCap && <AbsoluteFill style={{ opacity: 1 - ramp(t, tCap - 0.35, tCap) }}>{rows(false)}</AbsoluteFill>}
      {t >= tCap - 0.35 && t < tC && (
        <AbsoluteFill style={{ opacity: Math.min(ramp(t, tCap - 0.35, tCap), 1 - ramp(t, tC - 0.35, tC)) }}>
          <BrowserFrame t={t} url="bilgin-kocak.github.io/hooktax/#/hook/0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf">
            <Capture name="hook7074" t={t} t0={t0} clipDuration={hook7074.duration} from={1.25} until={tC} />
            <Box t={t} at={t0 + hook7074.marks.card + 0.2} until={tInto - 0.05} x={180} y={412} w={1560} h={60} color={C.warn} label="today: 2.299% (measured)" />
            <Box t={t} at={tInto} until={tC} x={180} y={628} w={1560} h={60} color={C.risk} label="after the real upgrade authority's upgrade, on a fork: 100%" labelSide="bottom" />
          </BrowserFrame>
          <div style={{ position: "absolute", right: 200, top: 190, ...rise(t, w("real", "98") - 0.2) }}>
            <Pill color="#16140f" bg={C.risk} style={{ fontSize: 28 }}>19 of 24 proved · 0–10% today → 98–100%</Pill>
          </div>
        </AbsoluteFill>
      )}
      {t >= tC - 0.35 && (
        <AbsoluteFill style={{ opacity: ramp(t, tC - 0.35, tC) }}>
          {rows(true)}
          <FunnelRow t={t} at={tC + 0.05} y={490} n={19} of={35} color={C.risk} text="proved: 0–10% today, 98–100% after the upgrade" />
          <FunnelRow t={t} at={tC + 0.45} y={660} n={5} of={35} color={C.info} text="not demonstrated, each with its reason:" />
          <div style={{ position: "absolute", left: 430, top: 800, fontFamily: SANS, fontSize: 29, color: C.muted, lineHeight: "44px" }}>
            {([
              ["2 × ProxyAdmin ownership renounced (owner() = 0x0): no one can upgrade them", w("real", "two") - 0.2, true],
              ["1 × UUPS upgradeToAndCall reverts UpgradesDisabled()", tC + 0.9, false],
              ["2 × no upgrade authority found", tC + 1.1, false],
            ] as const).map(([s, at, hot], i) => (
              <div key={i} style={{ ...rise(t, at as number), color: hot && t > (at as number) ? C.fg : C.muted }}>{hot ? <b style={{ color: C.ok }}>{s}</b> : s}</div>
            ))}
          </div>
        </AbsoluteFill>
      )}
      <CodeChip t={t} at={a + 0.5} until={b} path="packages/sim/test/ProbeUpgrade.t.sol" note="impersonate the authority, upgrade, re-measure" />
    </Scene>
  );
};

/* ---------------------------------------------------------------- 7. Arkiv */
const Entity: React.FC<{ t: number; at: number; name: string; n: number; note: string }> = ({ t, at, name, n, note }) => {
  const lit = ramp(t, at - 0.1, at + 0.3);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 18px", borderRadius: 12, marginTop: 12,
      background: `rgba(111,211,160,${0.04 + 0.14 * lit})`, border: `1.5px solid ${lit > 0.5 ? C.ok : C.line}` }}>
      <div style={{ width: 150, fontFamily: MONO, fontSize: 24, color: lit > 0.5 ? C.ok : C.muted }}>{name}</div>
      <div style={{ width: 150, fontFamily: SANS, fontSize: 40, fontWeight: 800, color: C.fg, textAlign: "right" }}>{n.toLocaleString("en-US")}</div>
      <div style={{ flex: 1, fontFamily: SANS, fontSize: 20, color: C.muted, lineHeight: "26px" }}>{note}</div>
    </div>
  );
};

export const Arkiv: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.arkiv;
  const tQuery = w("arkiv", "every", 3);
  const clipT0 = tQuery - atlas.marks["query-open"];
  const clipEnd = clipT0 + atlas.duration;
  const tFull = w("arkiv", "wallet") + 0.25;
  const k = easeInOut(ramp(t, tFull, tFull + 0.75));
  const tCurl = w("arkiv", "heres");
  const tSafety = w("arkiv", "safety");
  const frame = { x: lerp(60, 170, k), y: lerp(210, 122, k), w: lerp(1110, 1580, k) };
  return (
    <Scene name="arkiv" t={t}>
      <BrowserFrame t={t} url="bilgin-kocak.github.io/hooktax/" x={frame.x} y={frame.y} w={frame.w}>
        <Capture name="atlas" t={t} t0={clipT0} clipDuration={atlas.duration} until={b} />
        <Box t={t} at={clipT0 + atlas.marks.both + 0.15} until={tQuery - 0.05} x={146} y={616} w={214} h={52} color={C.risk} label="35: upgradeable and can change swap amounts" labelSide="bottom" />
        <Box t={t} at={tQuery + 0.1} until={tCurl - 0.05} x={170} y={598} w={1580} h={96} color={C.ok} label="the exact Arkiv query this view ran" labelSide="bottom" />
        {t >= tCurl && t < tSafety + 0.2 && (
          <div style={{ position: "absolute", left: 160, top: 772, width: 1600, padding: "16px 24px", borderRadius: 14, background: "rgba(13,12,10,0.96)",
            border: `2px solid ${C.ok}`, opacity: windowed(t, tCurl, tSafety + 0.2, 0.25) }}>
            <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 700, color: C.ok, marginBottom: 10 }}>Copy curl → anyone can run it against Arkiv</div>
            <div style={{ fontFamily: MONO, fontSize: 18, color: C.fg, lineHeight: "25px", wordBreak: "break-all" }}>{atlasQuery.curl}</div>
          </div>
        )}
        {t >= tSafety && (
          <div style={{ position: "absolute", left: 160, top: 772, width: 1600, padding: "18px 26px", borderRadius: 14, background: "rgba(13,12,10,0.96)",
            border: `2px solid ${C.warn}`, ...rise(t, tSafety), fontFamily: SANS }}>
            <div style={{ fontSize: 30, color: C.fg }}><b style={{ color: C.warn }}>SimResult</b> entities are readonly and expire <b>7 days after the measurement</b>: stale safety numbers delete themselves.</div>
            <div style={{ fontSize: 26, color: C.muted, marginTop: 10 }}><b style={{ color: C.ok }}>Hook</b> and <b style={{ color: C.ok }}>Pool</b> entities live 30 days and are extended by every import.</div>
          </div>
        )}
      </BrowserFrame>
      {t < tFull + 0.8 && (
        <div style={{ position: "absolute", left: 1215, top: 210, width: 650, opacity: 1 - k, ...(t < a + 0.6 ? rise(t, a + 0.1) : {}) }}>
          <div style={{ fontFamily: SANS, fontSize: 46, fontWeight: 800, color: C.fg }}>HookAtlas on Arkiv</div>
          <div style={{ fontFamily: SANS, fontSize: 24, color: C.muted, marginTop: 6 }}>Rabdi testnet · chain 7794095 · read with .ownedBy(writer)</div>
          <Entity t={t} at={w("arkiv", "hook")} name="Hook" n={11242} note="every v4 hook · 31 indexed attributes" />
          <Entity t={t} at={w("arkiv", "pool")} name="Pool" n={24535} note="every hooked pool with live liquidity" />
          <Entity t={t} at={w("arkiv", "measurement")} name="SimResult" n={70} note="fork measurements · expire after 7 days" />
          <Entity t={t} at={w("arkiv", "wallet")} name="Import" n={1} note="the import run that wrote them" />
          <div style={{ marginTop: 22, padding: "12px 16px", borderRadius: 10, border: `1.5px solid ${t > w("arkiv", "written") ? C.ok : C.line}`, fontFamily: MONO, fontSize: 19, color: C.fg }}>
            <div style={{ fontFamily: SANS, fontSize: 20, color: C.muted, marginBottom: 4 }}>one writer wallet</div>
            0x4aAa2e7d4693fe0648BB8767381266fe09497c2A
          </div>
        </div>
      )}
      <CodeChip t={t} at={a + 0.4} until={tFull} path="packages/arkiv/src/schemas.ts" note="Hook · Pool · SimResult · Import" />
      <CodeChip t={t} at={tFull + 0.1} until={tSafety} path="apps/web/src/arkiv.ts" note="browser → Arkiv, .ownedBy(writer)" />
      <CodeChip t={t} at={tSafety} until={b} path="packages/arkiv/src/sync.ts" note="SIM_LIFETIME_DAYS = 7" />
      {clipEnd > b + 5 && <span />}
    </Scene>
  );
};

/* ---------------------------------------------------------------- 8. Chainlink CRE */
const FlowNode: React.FC<{ t: number; at: number; x: number; title: string; l1: string; l2: string; hot?: number; color?: string }> = ({ t, at, x, title, l1, l2, hot = 0, color = C.accent }) => (
  <div style={{ position: "absolute", left: x, top: 330, width: 390, height: 240, borderRadius: 20, background: C.panel, padding: "24px 26px",
    border: `2.5px solid ${hot > 0 ? color : C.line}`, boxShadow: hot > 0 ? `0 0 ${36 * hot}px ${color}55` : "none", ...rise(t, at) }}>
    <div style={{ fontFamily: SANS, fontSize: 32, fontWeight: 800, color: hot > 0 ? color : C.fg }}>{title}</div>
    <div style={{ fontFamily: MONO, fontSize: 22, color: C.fg, marginTop: 14 }}>{l1}</div>
    <div style={{ fontFamily: SANS, fontSize: 22, color: C.muted, marginTop: 10, lineHeight: "30px" }}>{l2}</div>
  </div>
);

const Packet: React.FC<{ t: number; from: number; until: number; x1: number; x2: number; label: string; color: string; y?: number }> = ({ t, from, until, x1, x2, label, color, y = 612 }) => {
  const o = windowed(t, from, until, 0.2);
  if (o <= 0) return null;
  const k = easeInOut(ramp(t, from, from + Math.min(1.1, (until - from) * 0.6)));
  const x = lerp(x1, x2, k);
  return (
    <>
      <div style={{ position: "absolute", left: x - 13, top: y - 13, width: 26, height: 26, borderRadius: 13, background: color, boxShadow: `0 0 22px ${color}`, opacity: o }} />
      <div style={{ position: "absolute", left: Math.min(x1, x2) - 60, top: y + 26, width: Math.abs(x2 - x1) + 120, textAlign: "center", opacity: o,
        fontFamily: MONO, fontSize: 23, color }}>{label}</div>
    </>
  );
};

const CRE_RUN = [
  "\x1b[32m✓\x1b[0m Workflow compiled",
  "\x1b[32m✓\x1b[0m Simulation limits enabled",
  "  Binary hash: b37015ec55bf5ccb0dcf49f4ee76cb0d31c1d38c36d258dddb2d96528211422e",
  "  Config hash: 96f0b78cde8c84d1c9691868669ed2f03402b9b72bad3283d2eac5b37124e2bf",
  "Fetching transaction receipt for 0xc4e97d3a1d8622747f9a8e68fb7cb24534e031bae8d8e6973441c9e52acaa12b...",
  "2026-11-05T23:31:58Z [SIMULATION] Simulator Initialized",
  "2026-11-05T23:31:58Z [SIMULATION] Running trigger trigger=evm:ChainSelector:5009297550715157269@1.0.0",
  "2026-11-05T23:31:58Z \x1b[34m[USER LOG]\x1b[0m new hooked pool 0x4a3382142bac0e41a222bc5950e2dec8770e05441766a7de0646de0bdadfe31e hook 0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf bits 0x3fff (can change swap amounts) (dynamic fee)",
  "2026-11-05T23:32:00Z \x1b[34m[USER LOG]\x1b[0m refresh accepted: job d12d9a7d-3ebc-4aa7-8b57-5fc2fe29e0e9, worst case swap-100",
  "",
  "\x1b[32m✓\x1b[0m Workflow Simulation Result:",
  "\"refresh queued for 0x4a3382142bac0e41a222bc5950e2dec8770e05441766a7de0646de0bdadfe31e (worst case: swap-100)\"",
  "",
  "2026-11-05T23:32:00Z [SIMULATION] Execution finished signal received",
];

export const Cre: React.FC<{ t: number }> = ({ t }) => {
  const [a, b] = S.cre;
  const tTerm = w("cre", "this") - 0.2;
  const X = [105, 545, 985, 1425];
  const mid = (i: number) => X[i] + 195;
  const tListen = w("cre", "listens");
  const tCalls = w("cre", "calls");
  const tChecks = w("cre", "checks");
  const tVer = w("cre", "verified");
  const chunks = CRE_RUN.map((line, i) => ({ t: i * 0.2 + (i >= 7 ? 0.6 : 0) + (i >= 8 ? 1.0 : 0), text: line + "\n" }));
  return (
    <Scene name="cre" t={t}>
      {t < tTerm && (
        <AbsoluteFill style={{ opacity: 1 - ramp(t, tTerm - 0.35, tTerm) }}>
          <div style={{ position: "absolute", left: 105, top: 165, fontFamily: SANS, fontSize: 46, fontWeight: 700, color: C.fg, ...rise(t, a + 0.1) }}>
            A Chainlink CRE workflow keeps the atlas current
          </div>
          {[0, 1, 2].map((i) => <div key={i} style={{ position: "absolute", left: X[i] + 390, top: 449, width: 50, height: 3, background: C.line, opacity: ramp(t, a + 0.6 + i * 0.2, a + 0.9 + i * 0.2) }} />)}
          <FlowNode t={t} at={a + 0.3} x={X[0]} title="Ethereum mainnet" l1="PoolManager" l2="Initialize log, finalized" hot={windowed(t, tListen - 0.2, tCalls)} color={CHAPTER_COLOR["Uniswap v4"]} />
          <FlowNode t={t} at={a + 0.5} x={X[1]} title="Chainlink CRE" l1="hooktax-refresh" l2="EVM log trigger · hooks ≠ 0 filtered in code" hot={ramp(t, w("cre", "chainlink"), w("cre", "chainlink") + 0.3)} />
          <FlowNode t={t} at={a + 0.7} x={X[2]} title="HookTax API" l1="POST /refresh" l2="{ poolId, txHash } · bearer token from CRE secrets" hot={windowed(t, tCalls, tTerm)} color={C.warn} />
          <FlowNode t={t} at={a + 0.9} x={X[3]} title="Verify · index · measure" l1="mainnet + fork" l2="re-checks the log on mainnet, re-indexes, re-measures" hot={windowed(t, tChecks - 0.2, tTerm)} color={C.ok} />
          <Packet t={t} from={tListen} until={tCalls} x1={mid(0)} x2={mid(1)} label="Initialize(…, hooks 0x7074…)" color={CHAPTER_COLOR["Uniswap v4"]} />
          <Packet t={t} from={tCalls} until={tChecks} x1={mid(1)} x2={mid(2)} label="POST /refresh" color={C.warn} />
          <Packet t={t} from={tChecks} until={tTerm} x1={mid(2)} x2={mid(1)} label="202 · same poolId ✓ · same permission bits ✓" color={C.ok} />
        </AbsoluteFill>
      )}
      {t >= tTerm - 0.35 && (
        <AbsoluteFill style={{ opacity: ramp(t, tTerm - 0.35, tTerm) }}>
          <Terminal t={t} x={120} y={110} w={1680} h={600} title="recorded output · cre workflow simulate · CRE CLI v1.39.0 · 2026-11-05 (docs/cre-simulation.md)"
            command="make cre-sim TX=0xc4e97d3a1d8622747f9a8e68fb7cb24534e031bae8d8e6973441c9e52acaa12b EVENT=19" typeAt={tTerm - 30} runAt={tTerm + 0.35}
            chunks={chunks} fontSize={19} lineHeight={26}
            highlights={[
              { from: w("cre", "fed") - 0.1, until: tVer - 0.1, lines: [7], color: CHAPTER_COLOR["Uniswap v4"] },
              { from: tVer - 0.1, until: b, lines: [8, 10, 11], color: C.ok },
            ]} />
          <Panel style={{ position: "absolute", left: 120, top: 735, width: 1680, padding: "18px 26px", ...rise(t, tVer - 0.3) }}>
            <div style={{ fontFamily: SANS, fontSize: 22, color: C.muted }}>what the API did with it (same run, <span style={{ fontFamily: MONO }}>GET /jobs/:id</span>, 12 s)</div>
            <div style={{ display: "flex", gap: 22, marginTop: 12, fontFamily: SANS, fontSize: 25 }}>
              {([
                ["verified", "Initialize log found on mainnet, hook matches → 202", tVer - 0.2, C.ok],
                ["index ✓", "hook 0x7074…, worst case swap-100", w("cre", "reindexed"), C.ok],
                ["simulate ✓", "fork re-measure, take 205 bps", w("cre", "remeasured"), C.ok],
                ["mirror –", "skipped: ARKIV_PRIVATE_KEY not set", w("cre", "remeasured") + 0.5, C.faint],
              ] as const).map(([k, v, at, col]) => (
                <div key={k} style={{ flex: 1, ...rise(t, at) }}><b style={{ color: col }}>{k}</b> <span style={{ color: col === C.faint ? C.faint : C.fg }}>{v}</span></div>
              ))}
            </div>
          </Panel>
        </AbsoluteFill>
      )}
      <CodeChip t={t} at={tListen} until={tCalls - 0.05} path="cre/hooktax-refresh/workflow.ts:158" note="log trigger" />
      <CodeChip t={t} at={tCalls} until={b} path="cre/hooktax-refresh/workflow.ts:89" note="postRefresh + answer check" />
    </Scene>
  );
};

/* ---------------------------------------------------------------- 9. close */
export const Close: React.FC<{ t: number }> = ({ t }) => {
  const [a] = S.close;
  const tWord = w("close", "hooktax");
  const tKnow = w("close", "know");
  const k = pop(t, tWord - 0.15, 0.7);
  const recap: Array<[string, string]> = [
    ["Uniswap v4", "measured take, and the worst case proved on mainnet forks"],
    ["Arkiv", "HookAtlas: every v4 hook, queried straight from the browser"],
    ["Chainlink CRE", "a workflow re-checks every new hooked pool"],
  ];
  return (
    <Scene name="close" t={t}>
      <AbsoluteFill style={{ alignItems: "center", fontFamily: SANS }}>
        <div style={{ marginTop: 130, display: "flex", flexDirection: "column", gap: 18 }}>
          {recap.map(([p, s], i) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 32, ...rise(t, a + 0.15 + i * 0.25) }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: CHAPTER_COLOR[p] }} />
              <b style={{ color: C.fg, width: 250 }}>{p}</b><span style={{ color: C.muted }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 90, fontSize: 150, fontWeight: 800, letterSpacing: -4, color: C.fg, opacity: clamp01(k * 1.5), transform: `scale(${0.92 + 0.08 * k})` }}>
          Hook<span style={{ color: C.warn }}>Tax</span>
        </div>
        <div style={{ fontSize: 46, color: C.fg, marginTop: 6, ...rise(t, tKnow - 0.1) }}>Know what a hook can take, before you trade.</div>
        <div style={{ marginTop: 60, display: "flex", gap: 50, fontFamily: MONO, fontSize: 28, color: C.accent, ...rise(t, tKnow + 1.4) }}>
          <span>bilgin-kocak.github.io/hooktax</span><span>github.com/bilgin-kocak/hooktax</span>
        </div>
        <div style={{ marginTop: 22, fontSize: 24, color: C.faint, ...rise(t, tKnow + 1.9) }}>
          A measurement, not an audit · data on Arkiv from writer <span style={{ fontFamily: MONO }}>0x4aAa…2c7A</span> · MIT
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

export { easeOut };
