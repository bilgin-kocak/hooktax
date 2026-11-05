// Read every entity of one schema owned by the HookTax writer, walking by key so writes during
// the walk cannot make rows repeat (docs: querying/paginate, "Page by key").

import { asc, gt } from "@arkiv-network/sdk/query";
import { key, type Schema } from "@arkiv-network/sdk/schema";
import type { Address, Hex } from "viem";
import type { ArkivPublicClient } from "./client";
import type { ExistingEntity } from "./plan";

type Row = Record<string, { value: unknown } | undefined> & { $key: Hex; $expiresAt: bigint };

export async function readExisting(
  client: ArkivPublicClient,
  schema: Schema,
  idColumn: string,
  owner: Address,
  optionalColumns: readonly string[],
  hasContentHash = true,
): Promise<ExistingEntity[]> {
  const selection: Record<string, true> = { $key: true, $expiresAt: true, [idColumn]: true };
  if (hasContentHash) selection.contentHash = true;
  for (const c of optionalColumns) selection[c] = true;

  const out: ExistingEntity[] = [];
  let lastKey: Hex | undefined;
  do {
    // The selection is built at runtime, so the SDK cannot type the rows; we read them loosely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (client as any).select(selection).from(schema, { onMismatch: "throw" }).ownedBy(owner);
    if (lastKey) q = q.where(gt("$key", key(lastKey)));
    const page = await q.orderBy(asc("$key")).limit(100).fetch();
    const rows = page.entities as Row[];
    for (const row of rows) {
      const id = row[idColumn]?.value;
      if (typeof id !== "string") continue;
      out.push({
        id: id.toLowerCase(),
        entityKey: row.$key,
        contentHash: hasContentHash ? ((row.contentHash?.value as string | undefined) ?? null) : null,
        expiresAt: row.$expiresAt,
        presentOptional: optionalColumns.filter((c) => row[c] !== undefined),
      });
    }
    lastKey = rows.length === 100 ? rows.at(-1)!.$key : undefined;
  } while (lastKey);
  return out;
}
