# HookTax

**What does this Uniswap v4 pool's hook take from me today, and what could it take tomorrow?**

Every Uniswap v4 pool can attach a *hook*: a contract that runs code on your swap. HookTax answers
that question in three parts, over all **11,242 hooks** on Ethereum mainnet:

- **Measured take (today).** On a mainnet fork, HookTax swaps a small amount through a hooked pool
  in both directions and traces every token movement. It reports the value that went to the hook,
  its owner, or anyone other than the swapper, the PoolManager and the LPs — as a share of the swap.
- **Capability ceiling (tomorrow).** From onchain facts (permission bits in the hook address, proxy
  slots, the dynamic-fee flag) it computes the worst case, and where it can, **proves** it on the
  fork: impersonate the admin, use the power, swap again. For **19 real mainnet hooks** it did: the
  same swap went from 0–9.9% today to **98–100%** after an impersonated upgrade.
- **HookAtlas.** A public, queryable directory of every v4 hook, stored on **Arkiv** and read
  straight from the browser — no HookTax server in the read path. A **Chainlink CRE** workflow keeps
  it fresh.

HookTax reports *measured take*, *capability* and *worst case*. It is a measurement tool, **not an
audit**, and never labels a hook.

| | |
|---|---|
| Live HookAtlas | **https://bilgin-kocak.github.io/hooktax/** (static, reads Arkiv from the browser; redeployed by CI on every push to `main`) |
| Demo video | 🧑 _record from [`docs/demo-script.md`](docs/demo-script.md)_ |
| Partner tracks | **Uniswap Foundation** ("Build with Uniswap") · **Arkiv** ("Mirror something Ethereum depends on") · **Chainlink** ("Best workflow with CRE") |
| Arkiv writer wallet | `0x4aAa2e7d4693fe0648BB8767381266fe09497c2A` (Rabdi testnet; readers filter `.ownedBy` this). Mirrors **all 11,242 hooks, all 24,535 hooked pools with live liquidity and 70 SimResults**, verified on-chain with no duplicate IDs (2026-11-06) |

## What one import found (Ethereum mainnet, block 26,347,887)

186,872 v4 pools · 47,130 hooked · 24,535 hooked pools with live liquidity · **11,242 unique
hooks** · **687 upgradeable** · **8,716 can change swap amounts** · 829 with a dynamic-fee pool ·
**35 that are upgradeable *and* can change swap amounts** (worst case: up to 100% of swap value).

Of those 35, 24 have a priced pool with liquidity. On a mainnet fork, impersonating each one's
upgrade authority and pointing the proxy at a take-everything implementation **succeeded for 19**:
today's take of 0–9.9% became 98.13–100%. The other 5 are "not demonstrated", each with the reason:
two ProxyAdmins whose ownership is renounced (no one can upgrade them), one `UpgradesDisabled()`,
two with no discoverable authority. See [`docs/measurement.md`](docs/measurement.md).

## Architecture

```
 Ethereum mainnet: read-only JSON-RPC (Initialize logs, bytecode, proxy slots, owner())
        │                                        │ forked locally (anvil/forge), never broadcast
        ▼                                        ▼
 packages/indexer                         packages/sim  ── SneakyFeeHook worst-case demo (M5)
        │                                        │
        ▼                                        ▼
 data/hooks.json + data/pools.json        data/sim-results.json
        └───────────────────┬────────────────────┘
                            ▼
                     packages/arkiv ──writes──► Arkiv (Rabdi) ◄──reads── apps/web (static) + packages/cli
                            ▲
                     packages/api: POST /refresh {poolId}
                            ▲
                     cre/: Chainlink CRE workflow (log trigger on PoolManager Initialize)
```

| Path | What it is | Milestone |
|---|---|---|
| `packages/core/` | shared logic: permission bits, capability rules, proxy classification, the card | M1 |
| `packages/indexer/` | `Initialize` logs → `data/hooks.json`, `data/pools.json` (viem) | M1 |
| `packages/arkiv/` | writes `Hook`/`Pool`/`SimResult` entities to Arkiv | M2 |
| `apps/web/` | static Vite/React page, reads Arkiv directly | M2, M6 |
| `cre/` | Chainlink CRE workflow → `POST /refresh` | M3 |
| `packages/api/` | HTTP service: verify, index, simulate, mirror one pool | M3 |
| `packages/sim/` | Foundry fork tests: measured take + `SneakyFeeHook` | M4, M5 |
| `packages/cli/` | `hooktax check <poolId\|hookAddress>` | M6 |
| `arkiv/`, `docs/` | judging files; spec, versions, methodology, testing, demo script | all |

## Where each integration lives (exact pointers)

**Uniswap v4**
- PoolManager address + `Initialize` topic/ABI + fee flags + EIP-1967 slots, verified: [`packages/core/src/constants.ts`](packages/core/src/constants.ts)
- The 14 permission bits decoded from the hook address: [`packages/core/src/permissions.ts:35`](packages/core/src/permissions.ts) (`permissionBits`, `decodePermissions`)
- The §3 capability rules: [`packages/core/src/capabilities.ts:38`](packages/core/src/capabilities.ts) (`computeCapabilities`, `worstCase`)
- Decoding real `Initialize` events: [`packages/indexer/src/pools.ts:23`](packages/indexer/src/pools.ts)
- Fork swap + full money-trace through the real PoolManager (v4-core `PoolSwapTest`): [`packages/sim/test/utils/TakeMeter.sol:101`](packages/sim/test/utils/TakeMeter.sol) (`measureSwap`, `vm.recordLogs`/`startStateDiffRecording`)
- Mining a hook address (v4-periphery `HookMiner`) + proving an upgrade: [`packages/sim/test/SneakyFeeHookDemo.t.sol:51`](packages/sim/test/SneakyFeeHookDemo.t.sol)
- Proving the worst case on **real** hooks (impersonate the upgrade authority, try ProxyAdmin/UUPS paths, re-measure): [`packages/sim/test/ProbeUpgrade.t.sol`](packages/sim/test/ProbeUpgrade.t.sol) (`_tryUpgrades`), with [`TakeAllImplementation.sol`](packages/sim/src/TakeAllImplementation.sol)

**Arkiv**
- Entity schemas (31-indexed-column `Hook`, `Pool`, `SimResult`, `Import`): [`packages/arkiv/src/schemas.ts`](packages/arkiv/src/schemas.ts)
- State-derived, idempotent sync + write-safety executor: [`packages/arkiv/src/sync.ts`](packages/arkiv/src/sync.ts), [`execute.ts`](packages/arkiv/src/execute.ts)
- **7-day `SimResult` expiry**, counted from the measurement (stale safety numbers self-delete): [`packages/arkiv/src/sync.ts`](packages/arkiv/src/sync.ts) (`SIM_LIFETIME_DAYS`, `simLifetimeBlocks`)
- Readonly `SimResult`s replaced (delete + create) when a result is re-derived: [`packages/arkiv/src/plan.ts`](packages/arkiv/src/plan.ts) (`planImmutable`)
- Risk-first mirror order and the tGLM reserve for a short budget: [`packages/arkiv/src/priority.ts`](packages/arkiv/src/priority.ts), [`execute.ts`](packages/arkiv/src/execute.ts) (`reserveWei`)
- Web app reads Arkiv directly from the browser, scoped `.ownedBy(writer)`: [`apps/web/src/arkiv.ts`](apps/web/src/arkiv.ts)

**Chainlink CRE**
- Log trigger on PoolManager `Initialize` (finalized), `hooks != 0` filtered in code: [`cre/hooktax-refresh/workflow.ts:158`](cre/hooktax-refresh/workflow.ts) (`initWorkflow`)
- HTTP POST to the API with consensus + answer verification: [`cre/hooktax-refresh/workflow.ts:89`](cre/hooktax-refresh/workflow.ts) (`postRefresh`, `onInitialize`)
- Build + simulation notes: [`docs/cre-simulation.md`](docs/cre-simulation.md)

## Quick start (clean clone)

Prerequisites: Node ≥ 22.12, pnpm 10.28, Foundry 1.5.1, and (for CRE) bun ≥ 1.2 and the `cre` CLI.
Exact versions and how they were installed: [`docs/versions.md`](docs/versions.md).

```bash
git clone --recurse-submodules https://github.com/bilgin-kocak/hooktax && cd hooktax
make install            # Foundry submodules + pnpm deps (lockfile) + CRE workflow deps (bun)
```

Already cloned without `--recurse-submodules`? `make install` runs `git submodule update --init
--recursive` for you (forge-std and v4-periphery are submodules of `packages/sim`).

```bash
cp .env.example .env    # fill in MAINNET_RPC_URL (optional; a public RPC is used otherwise)
make doctor             # shows toolchain + which config keys are set (never prints values)
```

```bash
make test               # 144 unit tests across the TS packages
make demo               # M5: SneakyFeeHook worst case on a fork (0.3% today -> 100% after upgrade)
make probe              # M5 on real hooks: impersonated upgrades of the 24 probe-able worst-case hooks
make atlas              # one-line summary of the committed dataset
make check ARG=0x676E38B66A7547FF685549E4Ad88134aC62200cC   # the HookTax card for a real hook
```

All make targets: `make help`. Regenerating the data and mirroring it:

```bash
make index              # incremental mainnet import -> data/hooks.json, data/pools.json (~53 min cold)
make measure ARGS="--limit 20"   # measured take on real pools (fork)
make arkiv-estimate     # unsigned projected tGLM cost of mirroring (no signing)
make arkiv-sync         # write HookAtlas to Arkiv, riskiest first (needs a funded writer)
make web                # run the HookAtlas page (reads Arkiv directly)
```

**One Arkiv query, no SDK needed.** Hooks that can change swap amounts *and* whose code can be
replaced, as HookTax's writer published them:

```bash
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["arkiv.schema = str('"'"'hooktax.v1.hook'"'"') AND $owner = addr(0x4aAa2e7d4693fe0648BB8767381266fe09497c2A) AND canAffectSwapAmounts = true AND isUpgradeable = true",{"select":{"key":true,"attributes":true},"limit":"0x19"}]}'
```

More queries and every schema: [`arkiv/schema.md`](arkiv/schema.md). The web page shows the exact
query behind each view.

## 🧑 Human checkpoints

| | Status |
|---|---|
| Fund the Arkiv writer (tGLM, faucet is browser + captcha) | ✅ done; the key lives in the gitignored `.env` |
| `cre login` for `make cre-sim` | ✅ done; real simulation in [`docs/cre-simulation.md`](docs/cre-simulation.md) |
| Archive RPC in `MAINNET_RPC_URL` | optional (public endpoints worked for import, measure and probe) |
| **Record the video** from [`docs/demo-script.md`](docs/demo-script.md) | 🧑 to do |
| **Submit the Uniswap feedback form** with [`FEEDBACK.md`](FEEDBACK.md) | 🧑 to do |
| Your own notes in [`arkiv/friction.md`](arkiv/friction.md); the review column in [`docs/ai.md`](docs/ai.md) | 🧑 to do |

To mirror with your own writer: `make arkiv-keygen` (testnet-only key into `.env`, prints the
address), fund it at [hub.arkiv.network/faucet](https://hub.arkiv.network/faucet), optionally add a
free `ARKIV_ACCESS_KEY` from [hub.arkiv.network/access-keys](https://hub.arkiv.network/access-keys),
then `make arkiv-sync`. A short balance is fine: the sync writes the riskiest entities first, stops
before `--reserve` (0.2 tGLM), and a re-run after funding continues where it stopped.

## Data source and license

- **Source:** public Ethereum mainnet data over JSON-RPC — v4 PoolManager `Initialize` events, hook
  bytecode, storage slots, view calls, pool state. **No Sourcify data** (excluded by Arkiv's rules)
  and **no Etherscan content**.
- **License status:** the raw inputs are public onchain data; the derived fields (decoded
  permissions, capability flags, measured take) and all code are MIT.

## Limits

- **Not an audit.** HookTax measures and reports capabilities; it does not judge intent.
- **Point in time.** Fork results describe one block and one small swap size, which is why
  `SimResult` entities on Arkiv expire after 7 days. See [`docs/measurement.md`](docs/measurement.md).
- **Unverified bytecode.** For hooks without published source we can only try known admin selectors;
  a power we could not exercise is "not demonstrated", never "absent".
- **Only pools with live liquidity are mirrored.** All 24,535 of them are on Arkiv (≈13.7 tGLM for
  the whole mirror); the other 22,595 hooked pools have no in-range liquidity, so there is nothing to
  swap or measure, and they live only in `data/*.json` (the CLI reads it). With a short budget the
  sync writes the riskiest and deepest first.
- **"Upgradeable" is a slot-based label.** The probes found ProxyAdmins with renounced ownership and
  an implementation with upgrades disabled; those hooks still show `isUpgradeable`, and their
  SimResult says why the worst case was not demonstrated.
- **A take above 100% of input is not a take** (e.g. a token paying out its own tax inside the swap):
  it is reported as "not determined" with its flows, never as a number.

## Third-party libraries and starter kits

| Library / kit | Version | Used for |
|---|---|---|
| [Foundry](https://github.com/foundry-rs/foundry) | 1.5.1 | fork tests, local fork, onchain checks |
| [Uniswap v4-core](https://github.com/Uniswap/v4-core) | `v4.0.0` | PoolManager, `Hooks`/`LPFeeLibrary`, `PoolSwapTest` router |
| [Uniswap v4-periphery](https://github.com/Uniswap/v4-periphery) | `main` `c6e4754` | `HookMiner` |
| [viem](https://viem.sh) | 2.57.16 | RPC, decoding, keys |
| [@arkiv-network/sdk](https://docs.arkiv.network) | 1.0.1 | Arkiv entities and queries |
| [@chainlink/cre-sdk](https://docs.chain.link/cre) + `cre` CLI | 1.23.0 / v1.39.0 | CRE workflow |
| [React](https://react.dev) / [Vite](https://vite.dev) | 19.3 / 7.3 | web app |
| TypeScript / tsx / Vitest | 5.9.3 / 4.23 / 4.1 | all TS packages |

## AI usage

Built with Claude Code from [`docs/spec/HOOKTAX_PROMPT.md`](docs/spec/HOOKTAX_PROMPT.md).
[`docs/ai.md`](docs/ai.md) records what was generated, from which prompt, and what the human
reviewed.

## License

[MIT](LICENSE)
