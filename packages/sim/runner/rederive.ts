// Re-derive the headline numbers of every stored SimResult from its recorded directions, using the
// current rule in parse.ts (headlineTake). No fork, no RPC: the per-direction measurements and
// money flows are kept exactly as measured; only status / measuredTakeBps / lpFeeBps / the
// generated notes are recomputed. Run after changing headlineTake:
//   pnpm --filter @hooktax/sim run rederive        (then: make arkiv-sync, which replaces changed SimResults)

import { writeFileSync } from "node:fs";
import { RESULTS, readResults } from "./common";
import { headlineTake } from "./parse";

const GENERATED_NOTE = /exceeds 100% of input; attribution is unreliable/;

const file = readResults();
let changed = 0;
for (const r of file.results) {
  const h = headlineTake(r.directions);
  const notes = [...(r.notes ?? []).filter((n) => !GENERATED_NOTE.test(n)), ...h.notes];
  const before = JSON.stringify([r.status, r.measuredTakeBps, r.lpFeeBps, r.notes ?? []]);
  const after = JSON.stringify([h.status, h.measuredTakeBps, h.lpFeeBps, notes]);
  if (before === after) continue;
  console.error(`${r.simId}: take ${r.measuredTakeBps} -> ${h.measuredTakeBps}, status ${r.status} -> ${h.status}, ${notes.length} note(s)`);
  r.status = h.status;
  r.measuredTakeBps = h.measuredTakeBps;
  r.lpFeeBps = h.lpFeeBps;
  r.notes = notes;
  changed++;
}
if (changed) writeFileSync(RESULTS, JSON.stringify(file, null, 1) + "\n");
console.error(`re-derived ${file.results.length} SimResults: ${changed} changed`);
