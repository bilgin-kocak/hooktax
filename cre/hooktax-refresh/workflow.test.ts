import { describe, expect } from "bun:test";
import { hexToBytes } from "viem";
import { HttpActionsMock, newTestRuntime, test } from "@chainlink/cre-sdk/test";
import fixtures from "./fixtures.initialize-logs.json";
import { INITIALIZE_TOPIC0, decodeInitialize, initWorkflow, onInitialize, permissionBits } from "./workflow";

const config = {
  chainSelectorName: "ethereum-mainnet",
  poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  refreshUrl: "http://localhost:8787/refresh",
};

// Real mainnet Initialize logs (same fixtures as the indexer tests), shaped like an EVMLog.
const asEvmLog = (l: { topics: string[]; data: string; transactionHash: string }) =>
  ({
    topics: l.topics.map((t) => hexToBytes(t as `0x${string}`)),
    data: hexToBytes(l.data as `0x${string}`),
    txHash: hexToBytes(l.transactionHash as `0x${string}`),
  }) as never;

// The SDK requests secrets in namespace "main" (test-runtime.js), so key the test secrets there.
const secrets = new Map([["main", new Map([["REFRESH_API_TOKEN", "test-token"]])]]);
// ResponseJson carries the body as base64 (protobuf JSON form).
const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("decodeInitialize", () => {
  test("decodes a real hooked pool", () => {
    const ev = decodeInitialize(asEvmLog(fixtures.hooked));
    expect(ev.hooks.toLowerCase()).toBe("0xa6c8d7514785c4314ee05ed566cb41151d43c0c0");
    expect(permissionBits(ev.hooks)).toBe(0xc0);
    expect(fixtures.hooked.topics[0]).toBe(INITIALIZE_TOPIC0);
  });
});

describe("onInitialize", () => {
  test("skips hookless pools without calling the API", () => {
    const http = HttpActionsMock.testInstance();
    http.sendRequest = () => {
      throw new Error("must not be called");
    };
    const runtime = newTestRuntime(secrets, {}, config);
    expect(onInitialize(runtime as never, asEvmLog(fixtures.hookless))).toBe("skipped: pool has no hook");
  });

  test("POSTs /refresh with the bearer token and checks the answer", () => {
    const http = HttpActionsMock.testInstance();
    let seen: { url?: string; auth?: string; body?: string } = {};
    http.sendRequest = (req) => {
      seen = { url: req.url, auth: req.headers?.Authorization ?? (req as never as { multiHeaders?: Record<string, { values: string[] }> }).multiHeaders?.Authorization?.values[0], body: new TextDecoder().decode(req.body) };
      const ev = decodeInitialize(asEvmLog(fixtures.hooked));
      return { statusCode: 202, body: b64(JSON.stringify({ ok: true, jobId: "j1", poolId: ev.poolId, hook: ev.hooks, permissionBits: 0xc0, worstCase: "none" })) };
    };
    const runtime = newTestRuntime(secrets, {}, config);
    const out = onInitialize(runtime as never, asEvmLog(fixtures.hooked));
    expect(out).toContain("refresh queued for 0xdf6c45ce");
    expect(seen.url).toBe(config.refreshUrl);
    expect(JSON.parse(seen.body ?? "{}").txHash).toBe(fixtures.hooked.transactionHash);
  });

  test("fails loudly when the API disagrees about the hook", () => {
    const http = HttpActionsMock.testInstance();
    http.sendRequest = () => {
      const ev = decodeInitialize(asEvmLog(fixtures.hooked));
      return { statusCode: 202, body: b64(JSON.stringify({ ok: true, jobId: "j1", poolId: ev.poolId, permissionBits: 0x88, worstCase: "x" })) };
    };
    const runtime = newTestRuntime(secrets, {}, config);
    expect(() => onInitialize(runtime as never, asEvmLog(fixtures.hooked))).toThrow(/permission bits/);
  });

  test("fails loudly on HTTP errors", () => {
    const http = HttpActionsMock.testInstance();
    http.sendRequest = () => ({ statusCode: 401, body: b64('{"ok":false,"error":"missing or invalid bearer token"}') });
    const runtime = newTestRuntime(secrets, {}, config);
    expect(() => onInitialize(runtime as never, asEvmLog(fixtures.hooked))).toThrow(/HTTP 401/);
  });
});

describe("initWorkflow", () => {
  test("one handler: log trigger on the PoolManager", () => {
    const handlers = initWorkflow(config);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!.fn).toBe(onInitialize);
  });
});
