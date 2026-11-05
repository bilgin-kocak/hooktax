// State-derived sync planning. Pure: given what we want and what the writer already owns on
// Arkiv, decide creates / patches / extensions / deletes. Because the plan is always derived from
// current chain state, re-running after a crash never creates duplicates (as long as only one
// writer process runs and no transaction from the writer is still pending; see sync.ts).

export interface DesiredEntity<V> {
  /** Natural ID (hook address, poolId, simId), lowercase. */
  id: string;
  values: V;
  contentHash: string;
}

export interface ExistingEntity {
  id: string;
  entityKey: `0x${string}`;
  contentHash: string | null;
  expiresAt: bigint;
  /** Optional columns currently set on the entity. */
  presentOptional: string[];
}

export interface SyncPlan<V> {
  creates: DesiredEntity<V>[];
  patches: Array<{ entityKey: `0x${string}`; desired: DesiredEntity<V>; unset: string[] }>;
  extensions: Array<{ entityKey: `0x${string}`; id: string }>;
  deletes: Array<{ entityKey: `0x${string}`; id: string; reason: "duplicate" }>;
  unchanged: number;
}

export interface PlanOptions {
  currentBlock: bigint;
  /** Extend entities expiring within this many blocks. */
  extendWithinBlocks: bigint;
  /** Optional column names of the schema. */
  optionalColumns: readonly string[];
}

export function planSync<V extends object>(
  desired: readonly DesiredEntity<V>[],
  existing: readonly ExistingEntity[],
  opts: PlanOptions,
): SyncPlan<V> {
  const plan: SyncPlan<V> = { creates: [], patches: [], extensions: [], deletes: [], unchanged: 0 };

  // Duplicates (e.g. from an older crashed run): keep the one that lives longest.
  const byId = new Map<string, ExistingEntity>();
  for (const e of existing) {
    const prev = byId.get(e.id);
    if (!prev) {
      byId.set(e.id, e);
      continue;
    }
    const [keep, drop] = e.expiresAt > prev.expiresAt ? [e, prev] : [prev, e];
    byId.set(e.id, keep);
    plan.deletes.push({ entityKey: drop.entityKey, id: drop.id, reason: "duplicate" });
  }

  const seen = new Set<string>();
  for (const d of desired) {
    if (seen.has(d.id)) throw new Error(`duplicate desired id ${d.id}`);
    seen.add(d.id);
    const e = byId.get(d.id);
    if (!e) {
      plan.creates.push(d);
      continue;
    }
    const needsExtension = e.expiresAt - opts.currentBlock < opts.extendWithinBlocks;
    if (e.contentHash !== d.contentHash) {
      const present = new Set(Object.keys(d.values));
      const unset = e.presentOptional.filter((c) => opts.optionalColumns.includes(c) && !present.has(c));
      plan.patches.push({ entityKey: e.entityKey, desired: d, unset });
    }
    if (needsExtension) plan.extensions.push({ entityKey: e.entityKey, id: e.id });
    if (e.contentHash === d.contentHash && !needsExtension) plan.unchanged++;
  }
  return plan;
}

export function planSize(p: SyncPlan<unknown>): number {
  return p.creates.length + p.patches.length + p.extensions.length + p.deletes.length;
}
