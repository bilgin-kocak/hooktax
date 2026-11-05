import {
  HOOK_FLAGS,
  PROXY_TYPE_LABEL,
  currencyLabel,
  formatFee,
  permissionLabel,
  type Tone,
  type ProxyType,
} from "@hooktax/core";
import type { CheckResult } from "./lookup";

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);
const TONE: Record<Tone, string> = { ok: "32", info: "36", warn: "33", risk: "31" };

export function renderCard(res: CheckResult, opts: { snapshotBlock: number; arkivQuery: string; writerKnown: boolean }): string {
  const { hook, pool, card } = res;
  const out: string[] = [];
  const rule = "─".repeat(74);

  out.push("");
  out.push(bold(`HookTax · ${pool ? "pool" : "hook"} ${pool ? pool.poolId : hook.address}`));
  if (pool) {
    const pair = `${currencyLabel(pool.currency0, pool.symbol0)} / ${currencyLabel(pool.currency1, pool.symbol1)}`;
    out.push(dim(`${pair}   fee ${formatFee(pool.fee)}   hook ${hook.address}`));
  }
  out.push(dim(`permission bits 0x${hook.permissionBits.toString(16).padStart(4, "0")}   proxy ${PROXY_TYPE_LABEL[hook.proxy.type as ProxyType] ?? hook.proxy.type}   ${hook.poolCount} pools`));
  out.push(rule);

  for (const line of card.lines) {
    out.push(`${line.label.padEnd(34)} ${c(TONE[line.tone], line.value)}`);
  }
  out.push("");
  out.push(bold("Capability rules triggered"));
  if (card.capabilities.length === 0) out.push(dim("  (none)"));
  for (const cap of card.capabilities) {
    const tone: Tone = cap.id.startsWith("worst-case") ? "risk" : cap.id === "no-swap-cut" ? "ok" : "warn";
    out.push(`  ${c(TONE[tone], "•")} ${cap.text}`);
  }

  out.push("");
  out.push(bold("Permissions (fixed in the hook address)"));
  const set = HOOK_FLAGS.filter((f) => hook.permissions[f.name]).map((f) => permissionLabel(f.name));
  out.push("  " + (set.length ? set.join(", ") : "none"));

  out.push("");
  out.push(dim(`Measurement, not an audit. Fork results are point-in-time (snapshot block ${opts.snapshotBlock}); SimResults on Arkiv expire after 7 days.`));
  out.push(dim(opts.writerKnown ? "Arkiv query behind this card:" : "Arkiv query (set VITE_ARKIV_WRITER_ADDRESS to fill in the writer):"));
  out.push(dim("  " + opts.arkivQuery));
  out.push(rule);
  return out.join("\n");
}
