// `make demo`: the SneakyFeeHook worst case, proved on a local mainnet fork.
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCard, decodePermissions, formatBps, permissionLabel, permissionNames, worstCase } from "@hooktax/core";
import { RAW_DIR, forkBlock, forkRpc, mergeResults, runForge, setup } from "./common";
import { parseLines, toSimRecords } from "./parse";

const B = "\x1b[1m";
const R = "\x1b[0m";
const RED = "\x1b[31m";
const GRN = "\x1b[32m";
const DIM = "\x1b[2m";

async function main() {
  setup();
  const block = await forkBlock();
  console.error(`${DIM}forking Ethereum mainnet at block ${block} (local fork, nothing is broadcast)${R}`);
  const code = await runForge("SneakyFeeHookDemo", { MAINNET_FORK_RPC: forkRpc(), FORK_BLOCK: String(block) });
  if (code !== 0) {
    console.error(`${RED}forge test failed (exit ${code})${R}`);
    process.exit(code);
  }
  const run = parseLines(readFileSync(path.join(RAW_DIR, "demo.txt"), "utf8"));
  const hook = run.hook!;
  const records = toSimRecords(run, {
    forkBlock: block,
    measuredAt: Math.floor(Date.now() / 1000),
    isDemo: true,
    context: () => ({ hook: hook.address, hookOwner: hook.owner }),
    labels: { today: "today (v1)", "after-admin-upgrade": "owner upgrade to v2" },
    notes: (_p, s) =>
      s === "today"
        ? ["Planted demo hook on a local fork; not a mainnet hook."]
        : [`Owner called upgradeToAndCall: implementation ${run.upgrades[0]?.from} -> ${run.upgrades[0]?.to}. Same address, same permission bits.`],
  });
  // Replace older demo results so the file keeps one demo story.
  mergeResults(records, (r) => r.isDemo);

  const perms = decodePermissions(hook.bits);
  const facts = { permissions: perms, isUpgradeable: true, hasDynamicFeePool: false };
  const today = records.find((r) => r.scenario === "today")!;
  const after = records.find((r) => r.scenario === "after-admin-upgrade")!;
  const card = buildCard({
    hook: { address: hook.address, permissions: perms, isUpgradeable: true, hasDynamicFeePool: false, proxyType: "eip1967-uups" },
    today: { ...today, label: today.label ?? null },
    demonstrations: [{ ...after, label: after.label ?? null }],
  });

  const line = "─".repeat(72);
  console.log(`\n${B}HookTax worst-case demo: SneakyFeeHook (planted on a local mainnet fork)${R}\n${line}`);
  console.log(`hook        ${hook.address}`);
  console.log(`permissions 0x${hook.bits.toString(16)} = ${permissionNames(perms).map(permissionLabel).join(" | ")}`);
  console.log(`proxy       EIP-1967 implementation slot -> ${hook.implementation} (UUPS)`);
  console.log(`\n${B}1. Before anything happens, from onchain facts alone:${R}`);
  console.log(`   ${RED}${worstCase(facts).text}${R}`);
  console.log(`\n${B}2. Measured today (v1), $1,000 each way:${R}`);
  for (const d of today.directions) console.log(`   ${d.zeroForOne ? "USDC -> WETH" : "WETH -> USDC"}  take ${formatBps(d.takeBps ?? 0)}   LP fee ${formatBps(d.lpFeeBps ?? 0)}`);
  console.log(`\n${B}3. The owner upgrades the code behind the same address (impersonated on the fork).${R}`);
  console.log(`   ${DIM}${run.upgrades[0]?.from} -> ${run.upgrades[0]?.to}${R}`);
  console.log(`\n${B}4. Measured again (v2):${R}`);
  for (const d of after.directions) {
    console.log(`   ${d.zeroForOne ? "USDC -> WETH" : "WETH -> USDC"}  take ${RED}${formatBps(d.takeBps ?? 0)}${R}   swapper received ${d.amountOut}`);
  }
  console.log(`\n${B}HookTax card${R}`);
  for (const l of card.lines) console.log(`   ${l.label.padEnd(32)} ${l.tone === "risk" ? RED : l.tone === "ok" ? GRN : ""}${l.value}${R}`);
  console.log(`   ${"Capabilities".padEnd(32)} ${card.capabilities.map((c) => c.text).join("; ")}`);
  console.log(`${line}\nwrote ${records.length} SimResults (isDemo) to data/sim-results.json; mirror them with: make arkiv-sync`);
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err).replace(/https?:\/\/\S+/g, "<rpc>"));
  process.exit(1);
});
