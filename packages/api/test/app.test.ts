import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorized, createHandler, parseRefreshBody, type Job } from "../src/app";

const POOL = "0x" + "ab".repeat(32);
const TOKEN = "s3cret-token";
let server: Server;
let base: string;
const jobs = new Map<string, Job>();

beforeAll(async () => {
  server = createServer(
    createHandler({
      token: TOKEN,
      verify: async (req) => {
        if (req.poolId !== POOL) throw new Error("no Initialize event for this poolId");
        return { poolId: req.poolId, hook: "0x0000000000000000000000000000000000000088", permissionBits: 0x88, capabilities: ["swap-delta"], worstCase: "code-bound" };
      },
      enqueue: (req) => {
        const job: Job = { id: "job-1", poolId: req.poolId, status: "queued", steps: [], createdAt: "now" };
        jobs.set(job.id, job);
        return job;
      },
      getJob: (id) => jobs.get(id),
    }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const post = (body: unknown, token = TOKEN) =>
  fetch(`${base}/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("refresh API", () => {
  it("health needs no auth", async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("rejects missing or wrong tokens", async () => {
    expect((await post({ poolId: POOL }, "nope")).status).toBe(401);
    expect((await fetch(`${base}/refresh`, { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("validates the body", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ poolId: "0x1234" })).status).toBe(400);
    expect((await post({ poolId: POOL, txHash: "0xzz" })).status).toBe(400);
  });

  it("422 when the pool cannot be verified onchain", async () => {
    const res = await post({ poolId: "0x" + "cd".repeat(32) });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });

  it("202 with the verified capability summary, then the job is readable", async () => {
    const res = await post({ poolId: POOL.toUpperCase().replace("0X", "0x") });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, jobId: "job-1", poolId: POOL, permissionBits: 0x88, worstCase: "code-bound" });
    const job = await fetch(`${base}/jobs/job-1`, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(((await job.json()) as { status: string }).status).toBe("queued");
  });

  it("helpers", () => {
    expect(authorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(authorized(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(authorized(`Bearer ${TOKEN}`, "")).toBe(false);
    expect(parseRefreshBody(JSON.stringify({ poolId: POOL }))).toEqual({ poolId: POOL });
  });
});
