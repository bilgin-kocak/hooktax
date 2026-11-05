import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base: "./"` makes the build work from any sub-path (e.g. GitHub Pages /hooktax/).
// envDir points at the repo root so the web app reads the same .env (only VITE_* vars are exposed).
export default defineConfig({
  base: "./",
  envDir: "../..",
  plugins: [react()],
  build: { target: "es2022", sourcemap: true },
});
