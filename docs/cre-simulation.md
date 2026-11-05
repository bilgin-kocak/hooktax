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
  Binary hash: 93bfa7661e04f1535b17297dee1029e888805e52f5282381375bca61b11e0fb1
✓ Build output written to cre/hooktax-refresh/binary.wasm
```

The workflow compiles to a 2.6 MB WASM binary. Its unit tests pass against real mainnet log
fixtures (`bun test`, 6 passing — see [`testing.md`](testing.md)).

## Simulate (needs a CRE account)

```bash
make cre-sim
# = cre workflow simulate hooktax-refresh --target staging-settings \
#     --non-interactive --trigger-index 0 \
#     --evm-tx-hash <tx of an Initialize with a hook> --evm-event-index <n>
```

🧑 **Human step.** `cre workflow simulate` requires authentication — `cre login` (browser-based) or
`CRE_API_KEY` for headless use. In this build environment neither was available (no browser, no
key), so the simulation was not run here; the workflow is built and unit-tested instead.

With an account, point the simulator at a real mainnet transaction that emitted an `Initialize` with
a non-zero hook (any hooked pool's creation tx from `data/pools.json` — the `transactionHash` and
`logIndex` fields). The simulator fetches that log from the configured RPC and runs the workflow
against it. Start the HookTax API first so the HTTP call has a target:

```bash
make api                     # terminal 1: POST /refresh on :8787 (needs REFRESH_API_TOKEN)
export REFRESH_API_TOKEN=... # same token the API uses; the workflow reads it as a secret
make cre-sim                 # terminal 2
```

Expected: the workflow logs the new hooked pool, POSTs `/refresh`, the API answers `202` with the
hook's capabilities, and the workflow logs `refresh queued for 0x… (worst case: …)`. Save the CLI
output under this file when run.

## Configuration

- `cre/project.yaml` — RPC per target (Ethereum mainnet).
- `cre/secrets.yaml` — maps the `REFRESH_API_TOKEN` secret id to the env var (simulation) / Vault
  DON (deployed).
- `cre/hooktax-refresh/workflow.yaml`, `config.*.json` — PoolManager address and the `/refresh` URL.
