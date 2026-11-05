# AI usage log

HookTax is built with **Claude Code** (Anthropic's coding agent) as the implementing engineer. The
human developer directs the work, reviews it, tests it and presents it. ETHGlobal requires this
disclosure. This file records what the AI generated, which prompt or spec drove it, and what the
human reviewed, milestone by milestone.

- **Master prompt / spec:** [`docs/spec/HOOKTAX_PROMPT.md`](spec/HOOKTAX_PROMPT.md), written by the
  human developer and committed verbatim. Every milestone below is driven by a section of it.
- **Per-commit attribution:** every AI-assisted commit carries a `Co-Authored-By: Claude …` trailer,
  so `git log` shows which commits came from the agent.
- **Legend:** *Generated* means written by Claude Code. *Human* means written by the developer.
  The **Human review** column is filled in by the developer (🧑).

## M0: Setup

| Files | Author | Driven by | Human review |
|---|---|---|---|
| `docs/spec/HOOKTAX_PROMPT.md` | Human (prompt text), committed verbatim by Claude Code | n/a | n/a |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `Makefile`, `.gitignore`, `.env.example`, `.nvmrc` | Generated | spec §0 rules 1–5, §4, §5 M0 | 🧑 pending |
| `README.md` per package, `arkiv/README.md`, `data/README.md` | Generated | spec §4, §5, §7 | 🧑 pending |
| `LICENSE` | Generated (standard MIT text) | spec §5 M0 | 🧑 pending |
| `docs/versions.md` | Generated. Each fact was checked against an official source or onchain, and the method is listed per row | spec §0 rule 5, §2 | 🧑 pending |
| `docs/ai.md` (this file), root `README.md` skeleton | Generated | spec §0 rule 3, §5 M7 | 🧑 pending |

Verification the agent did in M0 (no code involved):

- fetched Uniswap's official v4 deployments page and confirmed the PoolManager address
- found the PoolManager deployment block onchain (`eth_getCode` boundary plus the first log)
- fetched `Hooks.sol`, `LPFeeLibrary.sol` and `IPoolManager.sol` from v4-core at tag `v4.0.0` and at `main`,
  and diffed the constants
- recomputed the EIP-1967 slots with `cast keccak`
- checked the Arkiv chain ID with `eth_chainId`
- read Arkiv's `llms.txt` and the "Connect to Arkiv" docs page
