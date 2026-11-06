// One clock for the whole film: absolute seconds from src/timeline.json (built by tools/timeline.py).
import { useCurrentFrame } from "remotion";
import timeline from "./timeline.json";

export type Word = { text: string; start: number; end: number };
export type SceneName = "cold" | "title" | "chain" | "measured" | "worst" | "real" | "arkiv" | "cre" | "close";
type Vo = { take: string; file: string; start: number; duration: number; words: Word[]; phrases: Word[] };

export const T = timeline as unknown as {
  fps: number;
  duration: number;
  scenes: Record<SceneName, [number, number]>;
  chapters: Partial<Record<SceneName, string>>;
  vo: Record<SceneName, Vo>;
};
export const FPS = T.fps;
export const S = T.scenes;
export const SCENES = Object.keys(S) as SceneName[];

export const useSeconds = () => useCurrentFrame() / FPS;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 before a, 1 after b, linear between. */
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** A springy 0 -> 1 (a little overshoot) starting at `at`. */
export const pop = (t: number, at: number, dur = 0.45) => {
  const x = clamp01((t - at) / dur);
  if (x <= 0) return 0;
  return 1 - Math.exp(-6 * x) * Math.cos(9 * x);
};
/** Visible between start and end, fading over `fade` seconds at both edges. */
export const windowed = (t: number, start: number, end: number, fade = 0.35) =>
  Math.min(ramp(t, start, start + fade), 1 - ramp(t, end - fade, end));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$]/g, "");
const find = (scene: SceneName, text: string, n: number): Word => {
  const hits = T.vo[scene].words.filter((x) => norm(x.text) === norm(text));
  if (!hits[n]) throw new Error(`no word "${text}" #${n} in ${scene}`);
  return hits[n];
};
/** Absolute start of the n-th spoken word `text` in a scene's voiceover (case and punctuation ignored). */
export const w = (scene: SceneName, text: string, n = 0) => find(scene, text, n).start;
/** Absolute end of that word. */
export const wEnd = (scene: SceneName, text: string, n = 0) => find(scene, text, n).end;
/** The scene a moment belongs to. */
export const sceneAt = (t: number): SceneName => SCENES.find((s) => t >= S[s][0] && t < S[s][1]) ?? SCENES[SCENES.length - 1];
