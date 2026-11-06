// The live HookAtlas dark theme (apps/web/src/styles.css), so the film and the captured site match.
export const C = {
  bg: "#14130f",
  bg2: "#0f0e0b",
  fg: "#ece8de",
  muted: "#a39d90",
  faint: "#6f6a5f",
  line: "#2f2c25",
  panel: "#1c1a15",
  panel2: "#24211b",
  accent: "#8d9cff",
  ok: "#6fd3a0",
  okBg: "#133022",
  warn: "#f2c467",
  warnBg: "#3a2c0c",
  risk: "#ff9a91",
  riskBg: "#3f1512",
  info: "#b6c6e2",
  infoBg: "#1d2636",
};
/** One colour per partner chapter. */
export const CHAPTER_COLOR: Record<string, string> = { "Uniswap v4": "#ff8fd0", Arkiv: C.ok, "Chainlink CRE": C.accent };
export const SANS = "Inter, 'DejaVu Sans', sans-serif";
export const MONO = "'DejaVu Sans Mono', monospace";
