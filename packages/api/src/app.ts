// HTTP handler for the HookTax refresh API. Pure request handling with injected dependencies, so it
// is unit-testable without a network. main.ts wires the real refresher, simulator and Arkiv sync.

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface RefreshRequest {
  poolId: string;
  txHash?: string;
}

/** What /refresh answers synchronously: the pool was verified onchain and the job is queued. */
export interface RefreshAccepted {
  ok: true;
  jobId: string;
  poolId: string;
  hook: string;
  permissionBits: number;
  capabilities: string[];
  worstCase: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  poolId: string;
  status: JobStatus;
  steps: Array<{ step: string; status: string; detail?: string }>;
  createdAt: string;
  finishedAt?: string;
  error?: string;
}

export interface AppDeps {
  token: string;
  /** Verify the pool onchain and return what /refresh reports. Throws on unknown or hookless pools. */
  verify: (req: RefreshRequest) => Promise<Omit<RefreshAccepted, "ok" | "jobId">>;
  /** Queue the full refresh (index + simulate + mirror). Returns the job. */
  enqueue: (req: RefreshRequest) => Job;
  getJob: (id: string) => Job | undefined;
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const MAX_BODY = 8 * 1024;

export function parseRefreshBody(raw: string): RefreshRequest {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "body must be JSON");
  }
  if (!body || typeof body !== "object") throw new HttpError(400, "body must be an object");
  const { poolId, txHash } = body as Record<string, unknown>;
  if (typeof poolId !== "string" || !HEX32.test(poolId)) throw new HttpError(400, "poolId must be 32-byte hex");
  if (txHash !== undefined && (typeof txHash !== "string" || !HEX32.test(txHash))) {
    throw new HttpError(400, "txHash must be 32-byte hex");
  }
  return { poolId: poolId.toLowerCase(), ...(txHash ? { txHash: (txHash as string).toLowerCase() } : {}) };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function authorized(header: string | undefined, token: string): boolean {
  if (!token) return false;
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]!);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createHandler(deps: AppDeps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

      if (!authorized(req.headers.authorization, deps.token)) throw new HttpError(401, "missing or invalid bearer token");

      if (req.method === "POST" && url.pathname === "/refresh") {
        const body = parseRefreshBody(await readBody(req));
        let verified;
        try {
          verified = await deps.verify(body);
        } catch (err) {
          throw new HttpError(422, err instanceof Error ? err.message : String(err));
        }
        const job = deps.enqueue(body);
        const out: RefreshAccepted = { ok: true, jobId: job.id, ...verified };
        return send(res, 202, out);
      }

      const m = /^\/jobs\/([\w-]+)$/.exec(url.pathname);
      if (req.method === "GET" && m) {
        const job = deps.getJob(m[1]!);
        if (!job) throw new HttpError(404, "no such job");
        return send(res, 200, job);
      }
      throw new HttpError(404, "not found");
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      send(res, status, { ok: false, error: status === 500 ? "internal error" : (err as Error).message });
      if (status === 500) console.error("api error:", err instanceof Error ? err.message : err);
    }
  };
}
