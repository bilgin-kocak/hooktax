// Batch executor following the Arkiv write-safety guidance (Arkiv-Network/skills,
// arkiv-write-safety, checked 2026-11-05):
//   - one writer process; refuse to start while the writer has a pending transaction
//   - every batch: unsigned eth_estimateGas first, then explicit nonce, current gasPrice and
//     gas = max(1,000,000 + 400,000 x (ops - 1), 2 x estimate), and gas <= latest gasLimit / 2
//   - split a batch when it does not fit (gas or calldata size)
//   - journal every submission and receipt; a failed or uncertain send stops the run
//     (state-derived planning makes a later re-run safe; see plan.ts)

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createWalletClient, type Expiry } from "@arkiv-network/sdk";
import type { Schema } from "@arkiv-network/sdk/schema";
import { custom, http, type Address, type Hex, type LocalAccount } from "viem";
import { arkivChain, gasPriceOf, redactArkiv, type ArkivPublicClient, type ArkivWalletClient } from "./client";

export type Op =
  | {
      kind: "create";
      id: string;
      schema: Schema;
      values: Record<string, unknown>;
      expiration: Expiry;
      flags?: { readonly?: boolean; permissionlessExtension?: boolean };
    }
  | { kind: "patch"; id: string; schema: Schema; entityKey: Hex; set: Record<string, unknown>; unset: string[] }
  | { kind: "extend"; id: string; entityKey: Hex; expiration: Expiry }
  | { kind: "delete"; id: string; entityKey: Hex };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBatch = any;

export function toBatch(ops: readonly Op[]): AnyBatch {
  const creates = ops.flatMap((o) =>
    o.kind === "create" ? [{ schema: o.schema, values: o.values, expiration: o.expiration, ...(o.flags ? { flags: o.flags } : {}) }] : [],
  );
  const patches = ops.flatMap((o) =>
    o.kind === "patch"
      ? [{ schema: o.schema, entityKey: o.entityKey, set: o.set, ...(o.unset.length ? { unset: o.unset } : {}) }]
      : [],
  );
  const extensions = ops.flatMap((o) => (o.kind === "extend" ? [{ entityKey: o.entityKey, expiration: o.expiration }] : []));
  const deletes = ops.flatMap((o) => (o.kind === "delete" ? [{ entityKey: o.entityKey }] : []));
  return {
    ...(creates.length ? { creates } : {}),
    ...(patches.length ? { patches } : {}),
    ...(extensions.length ? { extensions } : {}),
    ...(deletes.length ? { deletes } : {}),
  };
}

export const gasFloor = (ops: number) => 1_000_000n + 400_000n * BigInt(Math.max(0, ops - 1));

class EstimateCaptured extends Error {
  constructor(
    readonly gas: bigint,
    readonly calldataBytes: number,
  ) {
    super("estimate captured");
  }
}

export interface Estimate {
  gas: bigint;
  calldataBytes: number;
}

/**
 * Unsigned estimate of one batch: runs the SDK's real encoding, intercepts eth_estimateGas and
 * stops there. Signing and sending are blocked, so this never spends anything (and works for an
 * unfunded writer address).
 */
export async function estimateBatch(writer: Address, ops: readonly Op[], accessKey?: string): Promise<Estimate> {
  const chain = arkivChain(accessKey);
  const base = http(undefined, { retryCount: 3, retryDelay: 1000, timeout: 60_000 })({ chain });
  const transport = custom(
    {
      async request({ method, params }: { method: string; params?: unknown }) {
        if (method === "eth_sendRawTransaction" || method === "eth_sendTransaction") {
          throw new Error("sending is blocked in estimate mode");
        }
        const result = await base.request({ method, params } as never);
        if (method === "eth_estimateGas") {
          const tx = (params as Array<{ data?: Hex }>)[0];
          throw new EstimateCaptured(BigInt(result as Hex), tx?.data ? (tx.data.length - 2) / 2 : 0);
        }
        return result;
      },
    },
    { retryCount: 0 },
  );
  const account = {
    address: writer,
    type: "local",
    source: "custom",
    publicKey: "0x",
    signMessage: async () => {
      throw new Error("signing is blocked in estimate mode");
    },
    signTransaction: async () => {
      throw new Error("signing is blocked in estimate mode");
    },
    signTypedData: async () => {
      throw new Error("signing is blocked in estimate mode");
    },
  } as unknown as LocalAccount;
  const wallet = createWalletClient({ chain, transport, account });
  try {
    await wallet.executeBatch(toBatch(ops));
  } catch (err) {
    let e: unknown = err;
    for (let i = 0; e && i < 30; i++) {
      if (e instanceof EstimateCaptured) return { gas: e.gas, calldataBytes: e.calldataBytes };
      e = (e as { cause?: unknown }).cause;
    }
    throw new Error(`unsigned estimate failed: ${redactArkiv(err instanceof Error ? err.message : String(err)).slice(0, 300)}`);
  }
  throw new Error("estimate path did not reach eth_estimateGas");
}

export interface ExecuteOptions {
  maxOps: number;
  /** Max calldata bytes per transaction (geth's default tx size cap is 128 KiB). */
  maxCalldataBytes: number;
  journalFile: string;
  accessKey?: string;
  log: (msg: string) => void;
  /** Called after each confirmed batch (for progress persistence). */
  onBatch?: (info: { ops: readonly Op[]; txHash: Hex; createdKeys: Hex[] }) => void;
}

export interface ExecuteResult {
  transactions: number;
  ops: number;
  gasUsedEstimate: bigint;
  txHashes: Hex[];
}

function journal(file: string, entry: Record<string, unknown>) {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n");
}

/** Split ops into batches that fit maxOps, gas (half block) and calldata limits, using unsigned estimates. */
async function nextFittingBatch(
  writer: Address,
  ops: readonly Op[],
  start: number,
  opts: ExecuteOptions,
  blockGasLimit: bigint,
  startSize: number,
): Promise<{ batch: Op[]; gas: bigint; estimate: Estimate }> {
  let n = Math.min(startSize, ops.length - start);
  let rateLimitRetries = 0;
  while (n >= 1) {
    const batch = ops.slice(start, start + n);
    let estimate: Estimate;
    try {
      estimate = await estimateBatch(writer, batch, opts.accessKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A rate limit is not about size: back off and retry the same batch.
      if (/\b429\b|rate.?limit|too many requests/i.test(msg) && rateLimitRetries < 6) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** rateLimitRetries++));
        continue;
      }
      // The node can reject estimating a large batch outright (observed on Rabdi: 20 ops errors,
      // 10 ops estimates fine). Treat an estimate error like "too big": halve, down to one op.
      if (n === 1) throw err;
      n = Math.max(1, Math.floor(n / 2));
      continue;
    }
    const gas = [gasFloor(batch.length), 2n * estimate.gas].reduce((a, b) => (a > b ? a : b));
    if (gas <= blockGasLimit / 2n && estimate.calldataBytes <= opts.maxCalldataBytes) return { batch, gas, estimate };
    if (n === 1) throw new Error(`a single operation does not fit (gas ${gas}, calldata ${estimate.calldataBytes} bytes)`);
    n = Math.max(1, Math.floor(n / 2));
  }
  throw new Error("unreachable");
}

export async function executeOps(
  publicClient: ArkivPublicClient,
  wallet: ArkivWalletClient,
  ops: readonly Op[],
  opts: ExecuteOptions,
): Promise<ExecuteResult> {
  const writer = wallet.account.address;
  const result: ExecuteResult = { transactions: 0, ops: 0, gasUsedEstimate: 0n, txHashes: [] };
  let i = 0;
  // Start each batch at the size that last fit, so a learned limit isn't re-probed every time.
  let sizeHint = opts.maxOps;
  while (i < ops.length) {
    const [latestNonce, pendingNonce, block, gasPrice] = await Promise.all([
      publicClient.getTransactionCount({ address: writer, blockTag: "latest" }),
      publicClient.getTransactionCount({ address: writer, blockTag: "pending" }),
      publicClient.getBlock({ blockTag: "latest" }),
      gasPriceOf(publicClient),
    ]);
    if (pendingNonce !== latestNonce) {
      throw new Error(`writer ${writer} has a pending transaction (nonce ${latestNonce}..${pendingNonce}); reconcile before writing`);
    }
    const { batch, gas, estimate } = await nextFittingBatch(writer, ops, i, opts, block.gasLimit, sizeHint);
    sizeHint = batch.length;
    const ids = batch.map((o) => `${o.kind}:${o.id}`);
    journal(opts.journalFile, { status: "submitting", nonce: latestNonce, gas, gasPrice, estimate: estimate.gas, calldataBytes: estimate.calldataBytes, ids });
    let res;
    try {
      res = await wallet.executeBatch(toBatch(batch), { nonce: latestNonce, gas, gasPrice });
    } catch (err) {
      const msg = redactArkiv(err instanceof Error ? err.message : String(err)).slice(0, 500);
      const txHash = (err as { txHash?: Hex }).txHash ?? null;
      journal(opts.journalFile, { status: "failed-or-uncertain", nonce: latestNonce, txHash, error: msg, ids });
      throw new Error(`batch at op ${i} failed or is uncertain (nonce ${latestNonce}, tx ${txHash ?? "unknown"}): ${msg}`);
    }
    journal(opts.journalFile, { status: "confirmed", nonce: latestNonce, txHash: res.txHash, created: res.createdEntities, ids });
    opts.onBatch?.({ ops: batch, txHash: res.txHash, createdKeys: res.createdEntities });
    result.transactions++;
    result.ops += batch.length;
    result.gasUsedEstimate += estimate.gas;
    result.txHashes.push(res.txHash);
    i += batch.length;
    opts.log(`  tx ${result.transactions}: ${batch.length} ops (${i}/${ops.length}) ${res.txHash}`);
  }
  return result;
}
