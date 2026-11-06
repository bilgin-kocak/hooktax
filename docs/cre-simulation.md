# Chainlink CRE simulation

The `hooktax-refresh` workflow ([`cre/hooktax-refresh/`](../cre/hooktax-refresh/)) is the live-refresh
orchestration layer: a CRE EVM log trigger on the Uniswap v4 PoolManager fires on every `Initialize`
event, and the workflow calls the HookTax API's `POST /refresh` so HookAtlas re-indexes, simulates
and mirrors that pool — with no HookTax server polling the chain.

## Why CRE is the orchestration layer

- The trigger runs on a decentralized oracle network, not on our box. There is no cron on a server
  we have to keep up; the refresh is driven by the chain event itself.
- The HTTP call is wrapped in consensus (`cacheSettings` makes one node call our API and the others
  reuse the result), and the workflow **verifies** the API's answer — same `poolId`, same permission
  bits as the event's hook address — so a single bad node can't push a bogus refresh.
- Anyone can read `workflow.ts` and see exactly which onchain event causes a refresh and what it
  calls. The policy is public, not buried in our infra.

## Build (works here, no account needed)

```bash
make cre-build
```

Result (CRE CLI `v1.39.0`, 2026-11-05):

```
✓ Workflow compiled successfully
  Binary hash: b37015ec55bf5ccb0dcf49f4ee76cb0d31c1d38c36d258dddb2d96528211422e
✓ Build output written to cre/hooktax-refresh/binary.wasm
```

The build is reproducible: a clean macOS checkout produced the same hash. (Before the `refreshUrl`
fix below it was `93bfa766…0fb1`, also reproduced byte for byte on a second machine.) The workflow
compiles to a 2.6 MB WASM binary. Its unit tests pass against real mainnet log fixtures
(`bun test`, 8 passing — see [`testing.md`](testing.md)).

## Simulate: a real run (2026-11-05, CRE CLI v1.39.0)

The trigger is a real Ethereum mainnet transaction: the `Initialize` of pool `0x4a338214…`, whose
hook `0x7074e4a0…` has all 14 permission bits and is upgradeable. (It is one of the 19 hooks whose
worst case `make probe` demonstrated on a fork, see [`measurement.md`](measurement.md).) In that
transaction's receipt, the `Initialize` log is at index **19** (its block-level `logIndex` is 188;
the simulator wants the index within the transaction).

```bash
make api      # terminal 1: POST /refresh on :8787 (REFRESH_API_TOKEN from .env)
export REFRESH_API_TOKEN=...   # terminal 2: the same token; the workflow reads it as a secret
make cre-sim TX=0xc4e97d3a1d8622747f9a8e68fb7cb24534e031bae8d8e6973441c9e52acaa12b EVENT=19
```

Output (verbatim; the timestamps are the CLI's local time, IST, although it prints `Z`; it was 18:02
UTC; the bearer token never appears in the output):

```
✓ Workflow compiled
✓ Simulation limits enabled
  Binary hash: b37015ec55bf5ccb0dcf49f4ee76cb0d31c1d38c36d258dddb2d96528211422e
  Config hash: 96f0b78cde8c84d1c9691868669ed2f03402b9b72bad3283d2eac5b37124e2bf
Fetching transaction receipt for 0xc4e97d3a1d8622747f9a8e68fb7cb24534e031bae8d8e6973441c9e52acaa12b...
2026-11-05T23:31:58Z [SIMULATION] Simulator Initialized
2026-11-05T23:31:58Z [SIMULATION] Running trigger trigger=evm:ChainSelector:5009297550715157269@1.0.0
2026-11-05T23:31:58Z [USER LOG] new hooked pool 0x4a3382142bac0e41a222bc5950e2dec8770e05441766a7de0646de0bdadfe31e hook 0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf bits 0x3fff (can change swap amounts) (dynamic fee)
2026-11-05T23:32:00Z [USER LOG] refresh accepted: job d12d9a7d-3ebc-4aa7-8b57-5fc2fe29e0e9, worst case swap-100

✓ Workflow Simulation Result:
"refresh queued for 0x4a3382142bac0e41a222bc5950e2dec8770e05441766a7de0646de0bdadfe31e (worst case: swap-100)"

2026-11-05T23:32:00Z [SIMULATION] Execution finished signal received
```

What happened, end to end:

1. The EVM log trigger delivered the real `Initialize` log; the workflow decoded it, saw a non-zero
   hook, and read its permission bits from the address (`0x3fff`).
2. It POSTed `/refresh {poolId, txHash}` with the bearer token. The API verified the pool against
   mainnet (the `Initialize` log exists, the hook matches) and answered `202` with the hook's
   capabilities and worst case.
3. The workflow checked the answer (same `poolId`, same permission bits) and returned the result.
4. The API's job then ran in 12 seconds (`GET /jobs/:id`, also bearer-authenticated):

```json
{ "status": "done", "steps": [
  { "step": "index",    "status": "ok", "detail": "hook 0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf, worst case swap-100" },
  { "step": "simulate", "status": "ok", "detail": "ok, take 205 bps" },
  { "step": "mirror",   "status": "skipped", "detail": "ARKIV_PRIVATE_KEY not set" } ] }
```

The mirror step was skipped on purpose: the full Arkiv sync was writing with the same key at the
time, and Arkiv writes must come from one process. (The 205 bps re-measure also exposed two sim
bugs, since fixed: the re-measure deleted the pool's upgrade demonstration, and its directions were
measured sequentially; the same pool now measures 2.299%, as in the probe.)

Two problems the first real simulation found, both fixed (commit `b8a880f`):

- **`Config validation failed: refreshUrl: Invalid url`** for `http://localhost:8787/refresh`.
  zod's `.url()` calls the global `URL`, which inside the CRE WASM runtime is the SDK's bundled
  polyfill; bun's native `URL` accepted it, so the unit tests passed. The config now validates the
  URL with a pattern, and two config tests cover it.
- **`bun is required … but was not found in PATH`**: `make cre-sim` only added `~/.cre/bin`. The
  Makefile now adds `~/.bun/bin` and `~/.cre/bin`, the official installers' default directories.

The CLI also warns that the secret `REFRESH_API_TOKEN` uses its own name as the env var. That is
deliberate (one name in `.env`, the API and the workflow), and harmless for simulation.

## Configuration

- `cre/project.yaml` — RPC per target (Ethereum mainnet).
- `cre/secrets.yaml` — maps the `REFRESH_API_TOKEN` secret id to the env var (simulation) / Vault
  DON (deployed).
- `cre/hooktax-refresh/workflow.yaml`, `config.*.json` — PoolManager address and the `/refresh` URL.
