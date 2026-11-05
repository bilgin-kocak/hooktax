// Rewrite data/hooks.json and data/pools.json in the compact one-record-per-line format.
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./env";
import { writeDataset } from "./output";

for (const [file, key] of [["hooks.json", "hooks"], ["pools.json", "pools"]] as const) {
  const p = path.join(REPO_ROOT, "data", file);
  const d = JSON.parse(readFileSync(p, "utf8")) as { meta: unknown } & Record<string, unknown[]>;
  writeDataset(p, d.meta, key, d[key]!);
  console.error(`compacted ${file}: ${d[key]!.length} records`);
}
