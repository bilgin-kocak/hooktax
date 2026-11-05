# HookTax

**What does this Uniswap v4 pool's hook take from me today, and what could it take tomorrow?**

Every Uniswap v4 pool can attach a *hook*, a contract that runs code on your swap. HookTax answers
that question in three parts:

- **Measured take (today).** On a mainnet fork, HookTax swaps a small amount through a hooked pool in
  both directions and traces every token movement. It reports the value that went to the hook, its
  owner, or anyone other than the swapper, the PoolManager and the LPs.
- **Capability ceiling (tomorrow).** From onchain facts (permission bits in the hook address, proxy
  slots, the dynamic-fee flag), HookTax computes the worst case. Where it can, it **proves** that
  worst case on the fork: it impersonates the admin, uses the power, and swaps again.
- **HookAtlas.** A public, queryable directory of every v4 hook on Ethereum mainnet, stored on
  **Arkiv**. Anyone can query it without our server. A **Chainlink CRE** workflow keeps it fresh.

HookTax reports *measured take*, *capability* and *worst case*. It is a measurement tool, **not an
audit**.

> **Status:** built during ETHGlobal Mumbai 2026. M0 (setup) is done. Sections marked _TBD_ are
> filled as milestones land; see the [spec](docs/spec/HOOKTAX_PROMPT.md) §5.

| | |
|---|---|
| Live HookAtlas | _TBD (M2)_ |
| Demo video | _TBD (M7)_ |
| Partner tracks | Uniswap Foundation ("Build with Uniswap") · Arkiv ("Mirror something Ethereum depends on") · Chainlink ("Best workflow with CRE") |

## Architecture

```
 Ethereum mainnet: read-only JSON-RPC (Initialize logs, bytecode, proxy slots, owner())
        │                                        │ forked locally (anvil / forge), never broadcast
        ▼                                        ▼
 packages/indexer                         packages/sim
        │                                        │
        ▼                                        ▼
 data/hooks.json + data/pools.json        data/sim-results.json
        └───────────────────┬────────────────────┘
                            ▼
                     packages/arkiv ──writes──► Arkiv (Rabdi testnet) ◄──reads── apps/web (static, no backend)
                            ▲
                            │ index + simulate + write one pool
                     packages/api: POST /refresh {poolId}
                            ▲
                            │ CRE HTTP capability
                     cre/: Chainlink CRE workflow (EVM log trigger on PoolManager Initialize, hooks != 0)
```

| Path | What it is | Milestone |
|---|---|---|
| `packages/indexer/` | TypeScript + viem: `Initialize` logs → `hooks.json` / `pools.json` | M1 |
| `packages/arkiv/` | writes `Hook`, `Pool`, `SimResult` entities to Arkiv | M2 |
| `apps/web/` | static Vite/React page that reads Arkiv directly | M2 |
| `cre/` | Chainlink CRE workflow → `POST /refresh` | M3 |
| `packages/api/` | small HTTP service: index, simulate and write one pool | M3 |
| `packages/sim/` | Foundry fork tests: measured take and the `SneakyFeeHook` worst case | M4, M5 |
| `arkiv/` | Arkiv judging files | M2–M7 |
| `docs/` | spec, versions, AI log, testing | all |

## Quick start (clean clone)

Prerequisites: Node ≥ 22.12, pnpm 10.28, and Foundry 1.5.1. Exact versions are in
[`docs/versions.md`](docs/versions.md).

```bash
pnpm install --frozen-lockfile
```

```bash
cp .env.example .env
```

```bash
make doctor
```

More commands are added per milestone (index → Arkiv sync → web → CRE simulation → `make demo`).

## Data source and license

- **Source:** public Ethereum mainnet data read over JSON-RPC: Uniswap v4 PoolManager `Initialize`
  events, hook bytecode, storage slots and view calls. We use **no Sourcify data** and copy **no
  Etherscan content**.
- **License status:** the raw inputs are public onchain data. The fields HookTax derives (decoded
  permissions, capability flags, measured take) and all code are released under the MIT license.
- **Arkiv writer wallet(s):** _TBD (M2)_.

## Limits

- **Not an audit.** HookTax measures and reports capabilities. It does not judge intent.
- **Point in time.** Fork results describe one block. A hook's behaviour can change afterwards,
  which is why `SimResult` entities on Arkiv expire after 7 days.
- **Unverified bytecode.** For hooks without published source, we can only try known admin
  selectors. A power we could not exercise is reported as "not demonstrated", not as "absent".

## Third-party libraries and starter kits

The spec requires each one to be listed. The table grows as milestones add dependencies.

| Library / kit | Version | Used for |
|---|---|---|
| [Foundry](https://github.com/foundry-rs/foundry) (forge, anvil, cast) | 1.5.1-stable | fork tests, local fork, onchain checks |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | all TS packages |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.15 | running TS scripts |
| [Vitest](https://vitest.dev/) | 4.1.12 | unit tests |

## AI usage

Built with Claude Code from the spec in [`docs/spec/HOOKTAX_PROMPT.md`](docs/spec/HOOKTAX_PROMPT.md).
[`docs/ai.md`](docs/ai.md) records what was generated, from which prompt, and what was reviewed.

## License

[MIT](LICENSE)
