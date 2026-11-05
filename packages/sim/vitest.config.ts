import { defineConfig } from "vitest/config";

// Only the TS runner's tests; lib/ holds Foundry submodules with their own (non-vitest) tests.
export default defineConfig({ test: { include: ["runner/**/*.test.ts"] } });
