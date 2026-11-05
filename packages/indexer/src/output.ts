import { writeFileSync } from "node:fs";

/**
 * Write `{ meta, <key>: [...] }` as valid JSON with one record per line: compact (no indentation)
 * but still diff-friendly, so a re-import shows changed hooks/pools as changed lines.
 */
export function writeDataset(file: string, meta: unknown, key: string, records: readonly unknown[]): void {
  const lines = records.map((r) => JSON.stringify(r));
  const body = `{"meta":${JSON.stringify(meta)},\n"${key}":[\n${lines.join(",\n")}\n]}\n`;
  writeFileSync(file, body);
}
