// Shared pieces: background, scene wrapper, chapter tag, captions, code chips, highlight boxes, captured footage.
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile } from "remotion";
import { C, CHAPTER_COLOR, MONO, SANS } from "./theme";
import { FPS, S, SceneName, T, clamp01, easeOut, pop, ramp, sceneAt, windowed } from "./time";

export const Background: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at 50% 38%, #1d1b16 0%, ${C.bg} 55%, ${C.bg2} 100%)` }} />
);

/** Renders its children only during a scene, dipping through the background at both edges. */
export const Scene: React.FC<{ name: SceneName; t: number; fade?: number; children: React.ReactNode }> = ({ name, t, fade = 0.35, children }) => {
  const [a, b] = S[name];
  if (t < a || t >= b) return null;
  const o = name === "cold" ? 1 - ramp(t, b - fade, b) : windowed(t, a, b, fade);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/** The partner chapter a scene belongs to, top left. */
export const ChapterTag: React.FC<{ t: number }> = ({ t }) => {
  const s = sceneAt(t);
  const label = T.chapters[s];
  if (!label) return null;
  const [a, b] = S[s];
  const prev = T.chapters[(Object.keys(S) as SceneName[])[(Object.keys(S) as SceneName[]).indexOf(s) - 1]];
  const next = T.chapters[(Object.keys(S) as SceneName[])[(Object.keys(S) as SceneName[]).indexOf(s) + 1]];
  const o = Math.min(prev === label ? 1 : ramp(t, a + 0.15, a + 0.6), next === label ? 1 : 1 - ramp(t, b - 0.4, b));
  const color = CHAPTER_COLOR[label] ?? C.accent;
  return (
    <div style={{ position: "absolute", left: 56, top: 40, opacity: o, display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 10px 16px",
      borderRadius: 999, background: "rgba(20,19,15,0.82)", border: `1.5px solid ${color}55`, fontFamily: SANS, fontSize: 24, fontWeight: 600, color: C.fg, letterSpacing: 0.3 }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: color, boxShadow: `0 0 14px ${color}` }} />
      {label}
    </div>
  );
};

/** Phrase captions of the voiceover, bottom centre. */
export const Caption: React.FC<{ t: number; hidden?: SceneName[] }> = ({ t, hidden = [] }) => {
  const s = sceneAt(t);
  if (hidden.includes(s)) return null;
  const ps = T.vo[s].phrases;
  let i = -1;
  for (let k = 0; k < ps.length; k++) if (t >= ps[k].start - 0.08) i = k;
  if (i < 0) return null;
  const p = ps[i];
  const end = i + 1 < ps.length ? ps[i + 1].start - 0.08 : p.end + 0.5;
  if (t > end) return null;
  const o = Math.min(ramp(t, p.start - 0.08, p.start + 0.06), 1 - ramp(t, end - 0.06, end));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, display: "flex", justifyContent: "center", opacity: o }}>
      <div style={{ maxWidth: 1480, padding: "12px 28px", borderRadius: 14, background: "rgba(12,11,9,0.80)", border: `1px solid ${C.line}`,
        fontFamily: SANS, fontSize: 40, fontWeight: 500, color: C.fg, textAlign: "center", lineHeight: 1.25 }}>{p.text}</div>
    </div>
  );
};

/** A pointer to the code that does what is on screen, top right. */
export const CodeChip: React.FC<{ t: number; at: number; until: number; path: string; note?: string }> = ({ t, at, until, path, note }) => {
  const o = windowed(t, at, until, 0.3);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", right: 56, top: 40, opacity: o, transform: `translateY(${(1 - easeOut(ramp(t, at, at + 0.35))) * -10}px)`,
      display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderRadius: 10, background: "rgba(20,19,15,0.88)", border: `1px solid ${C.line}` }}>
      <span style={{ fontFamily: MONO, fontSize: 21, color: C.accent }}>{"</>"}</span>
      <span style={{ fontFamily: MONO, fontSize: 21, color: C.fg }}>{path}</span>
      {note && <span style={{ fontFamily: SANS, fontSize: 20, color: C.muted }}>{note}</span>}
    </div>
  );
};

/** An animated outline around something on screen (frame coordinates, 1920x1080). */
export const Box: React.FC<{ t: number; at: number; until: number; x: number; y: number; w: number; h: number; color?: string; label?: string; labelSide?: "top" | "bottom" }> = (
  { t, at, until, x, y, w, h, color = C.warn, label, labelSide = "top" }) => {
  const o = windowed(t, at, until, 0.25);
  if (o <= 0) return null;
  const k = pop(t, at, 0.5);
  const grow = 14 * (1 - clamp01(k));
  return (
    <>
      <div style={{ position: "absolute", left: x - grow, top: y - grow, width: w + 2 * grow, height: h + 2 * grow, opacity: o, borderRadius: 12,
        border: `4px solid ${color}`, boxShadow: `0 0 0 9999px rgba(8,7,5,${0.42 * o}), 0 0 32px ${color}88` }} />
      {label && (
        <div style={{ position: "absolute", left: x, top: labelSide === "top" ? y - 58 : y + h + 12, opacity: o, padding: "6px 14px", borderRadius: 8,
          background: color, color: "#16140f", fontFamily: SANS, fontSize: 26, fontWeight: 700 }}>{label}</div>
      )}
    </>
  );
};

/**
 * Footage captured from the live site, played at its real speed. `t0` is the film time at which the clip's
 * own second 0 would play; nothing before `from` (clip seconds) is shown; after the clip ends its last frame holds.
 */
export const Capture: React.FC<{ name: string; t: number; t0: number; clipDuration: number; from?: number; until: number; style?: React.CSSProperties }> = (
  { name, t, t0, clipDuration, from = 0, until, style }) => {
  const start = t0 + from;
  const clipEnd = t0 + clipDuration;
  if (t < start || t >= until) return null;
  const box: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: 1920, height: 1080, ...style };
  if (t >= clipEnd - 1 / FPS) return <Img src={staticFile(`capture/${name}-last.png`)} style={box} />;
  return (
    <Sequence from={Math.round(start * FPS)} durationInFrames={Math.max(1, Math.round((Math.min(clipEnd, until) - start) * FPS))} layout="none">
      <OffthreadVideo src={staticFile(`capture/${name}.mp4`)} trimBefore={Math.round(from * FPS)} muted style={box} />
    </Sequence>
  );
};

/** A number that counts up to `value` from `at` over `dur` seconds. */
export const Counter: React.FC<{ t: number; at: number; value: number; dur?: number; style?: React.CSSProperties }> = ({ t, at, value, dur = 1.1, style }) => {
  const v = Math.round(value * easeOut(ramp(t, at, at + dur)));
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{v.toLocaleString("en-US")}</span>;
};

export const Panel: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.45)", ...style }}>{children}</div>
);

export const Pill: React.FC<{ color: string; bg: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ color, bg, children, style }) => (
  <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 8, color, background: bg, fontFamily: SANS, fontWeight: 600, ...style }}>{children}</span>
);

/** Fade + slight rise in at `at`. */
export const rise = (t: number, at: number, dist = 18): React.CSSProperties => {
  const k = easeOut(ramp(t, at, at + 0.45));
  return { opacity: k, transform: `translateY(${(1 - k) * dist}px)` };
};
