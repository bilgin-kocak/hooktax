// A browser window around footage of the live site. Children are laid out in capture coordinates (1920x1080).
import React from "react";
import { C, SANS } from "./theme";

export const BrowserFrame: React.FC<{ t: number; url: string; x?: number; y?: number; w?: number; opacity?: number; children: React.ReactNode }> = (
  { url, x = 170, y = 122, w = 1580, opacity = 1, children }) => {
  const s = w / 1920;
  const bar = 46;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: 1080 * s + bar, borderRadius: 14, overflow: "hidden", opacity,
      border: `1px solid ${C.line}`, boxShadow: "0 30px 90px rgba(0,0,0,0.55)", background: C.bg }}>
      <div style={{ height: bar, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", background: "#1d1b17", borderBottom: `1px solid ${C.line}` }}>
        {["#ff6f61", "#f2c467", "#6fd3a0"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.75 }} />)}
        <div style={{ marginLeft: 14, flex: 1, height: 30, borderRadius: 8, background: "#12110e", display: "flex", alignItems: "center", padding: "0 14px",
          fontFamily: SANS, fontSize: 18, color: C.fg, whiteSpace: "nowrap", overflow: "hidden" }}>
          <span style={{ color: C.faint }}>https://</span>{url}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: bar, width: 1920, height: 1080, transform: `scale(${s})`, transformOrigin: "top left", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};
