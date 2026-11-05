# Friction log

Honest problems we hit building on Arkiv (SDK `@arkiv-network/sdk@1.0.1`, Rabdi testnet), each with
what we expected, what happened, and how to reproduce. 🧑 *The human developer will add their own
notes after review.*

## 1. A batch gas estimate fails for an unfunded writer, but a single op estimates fine

- **Expected:** `eth_estimateGas` for an `execute` batch is a read; it should return a per-op gas
  figure regardless of the account's balance, so we can show a projected cost before funding.
- **Happened:** estimating a 20-op `executeBatch` from a zero-balance writer returns
  `Transaction failed: Execution error without revert data`. The *same* build estimated as a single
  op returns a clean `316,541` gas. So the failure scales with batch size on an unfunded account.
- **Impact:** our "preview the cost before you fund" flow (`make arkiv-estimate`) crashed on a fresh
  wallet — exactly when you most want a preview.
- **Workaround:** the estimator now halves the sample on failure down to one op and reports
  `gas/op × total` ([`packages/arkiv/src/sync.ts`](../packages/arkiv/src/sync.ts)). With it,
  `make arkiv-estimate` projects 35,800 entities ≈ 20.8 tGLM.
- **Repro:** fresh key via `make arkiv-keygen` (do **not** fund it), then `make arkiv-estimate`;
  revert the shrink loop to see the raw failure.

## 2. The faucet can't be used headlessly

- **Expected:** some way to fund a dev wallet from a script (a POST endpoint, a signed request).
- **Happened:** the faucet at `hub.arkiv.network/faucet` is a client-side app that connects a
  browser wallet and runs a captcha-style claim. There is no documented headless claim.
- **Impact:** an automated/agent build can get all the way to a correct, estimated, ready-to-send
  Arkiv sync and still not fund the writer — the live write is gated on a human with a browser. The
  whole read/write path is tested (schema validation via the SDK, planning, unsigned estimate), but
  the final signed write waits on a funded key.
- **Repro:** `make arkiv-keygen`, then try to fund without opening the hub in a browser.

## 3. The keyless public RPC is heavily rate limited

- **Expected:** enough headroom to run an import's worth of `arkiv_query` reads.
- **Happened:** without an access key the SDK warns and the public endpoint returns HTTP 429 under
  light load. An access key (free, from `hub.arkiv.network/access-keys`) fixes it, but getting one
  needs a hub login — another browser step for an automated build.
- **Workaround:** `ARKIV_ACCESS_KEY` is optional everywhere; reads retry with backoff. The web app
  takes a separate browser key locked to its origin.

## 4. 31 indexed columns is a real ceiling for a rich entity

- **Expected:** index every fact we might filter on.
- **Happened:** a named schema allows 31 columns. The `Hook` entity already spends 14 on the
  individual permission bits plus the derived flags, which is most of the budget. We kept the
  high-value filters indexed (`canAffectSwapAmounts`, `isUpgradeable`, `worstCase`, …) and moved the
  rest — proxy implementation/admin/beacon addresses, code size, owner kind, sample pool ids — into
  one unindexed `details` bytes blob (JSON). That is the right call, but it means those fields are
  readable, not filterable.
- **Repro:** add a 32nd indexed column to `HookSchema` and `defineSchema` throws.

## 5. Values are typed objects, read through `.value`

- **Expected (as newcomers):** a query row is a plain object.
- **Happened:** each attribute comes back as `{ type, value }` and must be read through `.value`;
  `dec`/`addr`/`u64`/`key` values must be *written* wrapped (`dec("4.5")`, not `4.5`). Easy to get
  wrong; the SDK's compile-time checks caught most of it. We validate every entity against the
  schema in a unit test using the SDK's own encoder with a no-network transport
  ([`packages/arkiv/test/map.test.ts`](../packages/arkiv/test/map.test.ts)).

None of these are blockers — the mirror design works and is fully tested up to the funded write.
Items 1–3 are the ones an agent or CI pipeline will hit first.
