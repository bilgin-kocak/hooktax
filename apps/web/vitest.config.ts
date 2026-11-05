import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Tests must not depend on the gitignored repo .env: give them a fixed, valid writer address.
// (Any valid address works; the tests assert query shape, not a specific writer.)
export default mergeConfig(
  viteConfig,
  defineConfig({ test: { env: { VITE_ARKIV_WRITER_ADDRESS: "0x000000000000000000000000000000000000dEaD" } } }),
);
