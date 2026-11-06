// A terminal that replays real output: each chunk appears at the moment it was printed (see tools/demo.timing).
import React from "react";
import { C, MONO, SANS } from "./theme";
import { easeInOut, ramp, windowed } from "./time";

type Span = { text: string; color?: string; bold?: boolean; dim?: boolean };
const ANSI: Record<number, string> = {
  30: "#8a857a", 31: "#ff7b72", 32: "#6fd3a0", 33: "#f2c467", 34: "#8d9cff", 35: "#d2a8ff", 36: "#7fdbe6", 37: C.fg,
  90: "#8a857a", 91: "#ff7b72", 92: "#6fd3a0", 93: "#f2c467", 94: "#8d9cff", 95: "#d2a8ff", 96: "#7fdbe6", 97: "#ffffff",
};

/** Terminal output as lines of styled spans (SGR colour, bold, dim); carriage returns dropped. */
export function parseAnsi(text: string): Span[][] {
  const lines: Span[][] = [[]];
  let st: Omit<Span, "text"> = {};
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (s: string) => {
    s.replace(/\r/g, "").split("\n").forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, ...st });
    });
  };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    last = re.lastIndex;
    for (const c of m[1] === "" ? [0] : m[1].split(";").map(Number)) {
      if (c === 0) st = {};
      else if (c === 1) st = { ...st, bold: true };
      else if (c === 2) st = { ...st, dim: true };
      else if (c === 22) st = { ...st, bold: false, dim: false };
      else if (c === 39) st = { ...st, color: undefined };
      else if (ANSI[c]) st = { ...st, color: ANSI[c] };
    }
  }
  push(text.slice(last));
  return lines;
}

export const plainLines = (text: string) => parseAnsi(text).map((l) => l.map((s) => s.text).join(""));

type Row = { spans: Span[]; logical: number };
/** Wraps logical lines to display rows of at most `cols` characters; continuation rows get `indent`. */
function wrap(lines: Span[][], cols: number): Row[] {
  const rows: Row[] = [];
  lines.forEach((spans, logical) => {
    const text = spans.map((s) => s.text).join("");
    if (text.length <= cols) return rows.push({ spans, logical });
    const indent = /^ {3}\S/.test(text) && text.length > 36 ? 36 : 4;
    let cur: Span[] = [];
    let len = 0;
    let first = true;
    const flush = () => { rows.push({ spans: cur, logical }); cur = [{ text: " ".repeat(indent) }]; len = indent; first = false; };
    for (const s of spans) {
      const words = s.text.split(/(?<= )/);
      for (const wd of words) {
        if (len + wd.length > cols && len > (first ? 0 : indent)) flush();
        cur.push({ ...s, text: wd });
        len += wd.length;
      }
    }
    if (cur.length) rows.push({ spans: cur, logical });
  });
  return rows;
}

export type Highlight = { from: number; until: number; lines: number[]; color: string };

export const Terminal: React.FC<{
  t: number; x: number; y: number; w: number; h: number; title: string;
  prompt?: string; command?: string; typeAt?: number;
  chunks: { t: number; text: string }[]; runAt: number;
  fontSize?: number; lineHeight?: number;
  scrollTo?: { at: number; line: number; dur?: number };
  highlights?: Highlight[];
  badge?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ t, x, y, w, h, title, prompt = "~/hooktax $ ", command, typeAt = 0, chunks, runAt, fontSize = 19, lineHeight = 25, scrollTo, highlights = [], badge, footer }) => {
  const pad = 26;
  const bar = 44;
  const cols = Math.floor((w - 2 * pad) / (fontSize * 0.602));
  const visibleRows = Math.floor((h - bar - 2 * pad) / lineHeight);
  const shown = chunks.filter((c) => runAt + c.t <= t).map((c) => c.text).join("");
  const all = chunks.map((c) => c.text).join("");
  const rowsAll = wrap(parseAnsi(all), cols);
  const rows = wrap(parseAnsi(shown), cols);
  const typed = command ? command.slice(0, Math.max(0, Math.floor((t - typeAt) * 16))) : "";
  const cursorOn = Math.floor(t * 2.2) % 2 === 0 && t < runAt + 0.2;

  // like a real terminal: keep the newest row in view while output arrives; later, scroll to a chosen line
  const total = rows.length + (command ? 1 : 0);
  let top = Math.max(0, total - visibleRows);
  if (scrollTo && t >= scrollTo.at) {
    const target = Math.max(0, rowsAll.findIndex((r) => r.logical === scrollTo.line) + (command ? 1 : 0) - 1);
    const k = easeInOut(ramp(t, scrollTo.at, scrollTo.at + (scrollTo.dur ?? 0.9)));
    top = top + (Math.min(target, Math.max(0, rowsAll.length + 1 - visibleRows)) - top) * k;
  }

  const hl = (logical: number) => {
    for (const hgl of highlights) {
      const o = windowed(t, hgl.from, hgl.until, 0.25);
      if (o > 0 && hgl.lines.includes(logical)) return { o, color: hgl.color };
    }
    return null;
  };

  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 16, overflow: "hidden", background: "#0d0c0a",
      border: `1px solid ${C.line}`, boxShadow: "0 30px 90px rgba(0,0,0,0.55)" }}>
      <div style={{ height: bar, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: "#1a1814", borderBottom: `1px solid ${C.line}` }}>
        {["#ff6f61", "#f2c467", "#6fd3a0"].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, opacity: 0.8 }} />)}
        <span style={{ marginLeft: 14, fontFamily: SANS, fontSize: 20, color: C.muted }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{badge}</span>
      </div>
      <div style={{ position: "absolute", left: pad, right: pad, top: bar + pad, bottom: pad, overflow: "hidden" }}>
        <div style={{ transform: `translateY(${-top * lineHeight}px)`, fontFamily: MONO, fontSize, lineHeight: `${lineHeight}px`, color: C.fg, whiteSpace: "pre" }}>
          {command && (
            <div>
              <span style={{ color: C.ok }}>{prompt}</span>
              <span>{typed}</span>
              {cursorOn && <span style={{ background: C.fg, color: "#0d0c0a" }}> </span>}
            </div>
          )}
          {rows.map((r, i) => {
            const h1 = hl(r.logical);
            return (
              <div key={i} style={{ position: "relative", height: lineHeight }}>
                {h1 && <div style={{ position: "absolute", left: -12, right: -12, top: 0, bottom: 0, opacity: h1.o, background: `${h1.color}26`, borderLeft: `4px solid ${h1.color}` }} />}
                <span style={{ position: "relative" }}>
                  {r.spans.map((s, k) => (
                    <span key={k} style={{ color: s.color ?? C.fg, fontWeight: s.bold ? 700 : 400, opacity: s.dim ? 0.62 : 1 }}>{s.text}</span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {footer}
    </div>
  );
};
