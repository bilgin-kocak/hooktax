// Usage:
//   pnpm --filter @hooktax/indexer index                    # full incremental import to the finalized block
//   pnpm --filter @hooktax/indexer index --to-block 21700000 --out /tmp/smoke
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT, loadRepoEnv } from "./env";
import { runIndexer } from "./run";
import { redact } from "./util";

async function main() {
  loadRepoEnv();
  const { values } = parseArgs({
    options: {
      "to-block": { type: "string" },
      out: { type: "string", default: path.join(REPO_ROOT, "data") },
      cache: { type: "string", default: path.join(REPO_ROOT, "data", "cache") },
    },
  });
  const toBlock = values["to-block"] ? Number(values["to-block"]) : undefined;
  if (toBlock !== undefined && !Number.isInteger(toBlock)) throw new Error("--to-block must be an integer");

  const started = Date.now();
  const res = await runIndexer({ toBlock, outDir: values.out!, cacheDir: values.cache! });
  const { counts, toBlock: last } = res.hooksFile.meta;
  const upgradeable = res.hooksFile.hooks.filter((h) => h.isUpgradeable).length;
  const swapDelta = res.hooksFile.hooks.filter((h) => h.canAffectSwapAmounts).length;
  console.error(
    [
      `done in ${((Date.now() - started) / 1000).toFixed(1)}s, up to block ${last}`,
      `  pools: ${counts.pools} (${counts.hookedPools} hooked, ${counts.hooklessPools} hookless)`,
      `  hooks: ${counts.hooks} (${counts.hooksWithCode} with code, ${upgradeable} upgradeable, ${swapDelta} can change swap amounts)`,
      `  wrote ${path.relative(process.cwd(), res.hooksPath)} and ${path.relative(process.cwd(), res.poolsPath)}`,
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? (err.stack ?? err.message) : String(err)));
  process.exit(1);
});
