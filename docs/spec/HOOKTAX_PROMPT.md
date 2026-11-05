# HookTax — Claude Code Build Prompt (ETHGlobal Mumbai 2026)

> Paste everything below the line into Claude Code at the root of an empty repo.
> Also commit this file as `docs/spec/HOOKTAX_PROMPT.md`. ETHGlobal requires the prompts/specs used with AI tools to be in the repository.

---

## 0. Role and ground rules

You are my senior engineer for a 36-hour hackathon (ETHGlobal Mumbai, Classic "from scratch" track). Submission deadline: **Saturday, Nov 7, 2026, 09:00 IST**. I am a solo developer (ML / data / Solidity background, **not** a smart-contract auditor). You write most of the code; I direct, review, test and present.

Hard rules:
1. **Fresh build.** Write all project code during the event. Public libraries and official starter kits are fine; note each one in `README.md`.
2. **Commit early and often.** Make a small, meaningful commit after every working step (ETHGlobal can disqualify large single commits). Use clear messages: `feat(indexer): decode hook permission bits`.
3. **Log your AI usage.** Keep `docs/ai.md` updated: which files or parts you generated, which prompts or specs drove them, and what I reviewed.
4. **Fork only, never mainnet writes.** All swaps, impersonation and upgrade simulations run on a local anvil/Foundry fork. Never broadcast a transaction to Ethereum mainnet. Never commit private keys or API keys; use `.env` plus `.env.example`.
5. **Verify, don't guess.** For any external API (Arkiv SDK, Chainlink CRE, Uniswap contracts), read the official docs or repo first and pin the version you used in `docs/versions.md`. If something here conflicts with the official docs, the docs win: tell me and adapt.
6. **Stop at human checkpoints** (marked 🧑) and tell me exactly what you need from me.
7. **Measurement, not accusation.** HookTax reports measured numbers and capabilities. It is not an audit. Never label a hook "malicious" or "scam". Use the words *measured take*, *capability* and *worst case*.

## 1. What we are building

**HookTax** answers one question for Uniswap v4 users and LPs: *"What does this pool's hook take from me today, and what could it take tomorrow?"*

- **Measured take (today):** on a mainnet fork, swap a small amount through a hooked pool in both directions and trace every token movement. Report how much value went to the hook, the hook owner, or any address other than the swapper and the PoolManager.
- **Capability ceiling (tomorrow):** v4 hook permissions are fixed in the hook address bits, but an *upgradeable* hook, or one whose owner controls fees, can change behaviour within those permissions. Compute the worst case from facts (permission bits, proxy slots, dynamic-fee flag). Where possible, **prove it on the fork**: impersonate the owner or admin, use the power, swap again, and show the new take.
- **HookAtlas:** a public, queryable directory of every v4 hook on Ethereum mainnet (permissions, upgradeability, pools using it, latest measured take), stored on **Arkiv**, with no dependence on our server.
- **Live refresh:** a **Chainlink CRE** workflow watches for new hooked pools and triggers an import and simulation.

Partner prizes (max 3):
1. **Uniswap Foundation**, "Build with Uniswap" (tooling for the ecosystem).
2. **Arkiv**, "Mirror something Ethereum depends on".
3. **Chainlink**, "Best workflow with CRE" (CLI simulation is enough).

## 2. Known facts to use (verify each against official sources)

- Uniswap v4 **PoolManager (Ethereum mainnet):** `0x000000000004444c5dc75cB358380D2e3dE08A90`. Confirm on the official Uniswap deployments page and record the deployment block.
- **Initialize event:** `Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1, uint24 fee, int24 tickSpacing, IHooks hooks, uint160 sqrtPriceX96, int24 tick)`. Pools with `hooks == address(0)` have no hook.
- **Hook permission bits** (lowest 14 bits of the hook address), from the v4-core `Hooks` library:
  - `1<<13` BEFORE_INITIALIZE
  - `1<<12` AFTER_INITIALIZE
  - `1<<11` BEFORE_ADD_LIQUIDITY
  - `1<<10` AFTER_ADD_LIQUIDITY
  - `1<<9` BEFORE_REMOVE_LIQUIDITY
  - `1<<8` AFTER_REMOVE_LIQUIDITY
  - `1<<7` BEFORE_SWAP
  - `1<<6` AFTER_SWAP
  - `1<<5` BEFORE_DONATE
  - `1<<4` AFTER_DONATE
  - `1<<3` BEFORE_SWAP_RETURNS_DELTA
  - `1<<2` AFTER_SWAP_RETURNS_DELTA
  - `1<<1` AFTER_ADD_LIQUIDITY_RETURNS_DELTA
  - `1<<0` AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA
- **Dynamic fee:** pool `fee == 0x800000` (`LPFeeLibrary.DYNAMIC_FEE_FLAG`). The hook can then call `updateDynamicLPFee`. The maximum LP fee is `1_000_000` (100%).
- **EIP-1967 slots:**
  - implementation `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`
  - admin `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103`
  - Also check for UUPS (`proxiableUUID()`) and beacon proxies.
- **Arkiv testnet:**
  - RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`
  - Explorer `https://rabdi.explorer.arkiv.network`
  - Indexer `https://indexer.rabdi.db-chain.testnet.arkiv.network`
  - Chain ID `7794095`
  - Faucet `https://hub.arkiv.network/faucet`
  - Access keys `https://hub.arkiv.network/access-keys`
  - SDK `@arkiv-network/sdk`. Read `https://docs.arkiv.network` and the AI tools at `https://hub.arkiv.network/ai-tools` before writing any Arkiv code.
- **Chainlink CRE:** docs `https://docs.chain.link/cre`, templates `https://github.com/smartcontractkit/cre-templates`. Simulation via the CRE CLI is sufficient for the prize.

## 3. Capability rules (deterministic, no judgment calls)

Compute these for every hook and show them in plain English:

| Condition | Capability shown to users |
|---|---|
| `BEFORE_SWAP_RETURNS_DELTA` or `AFTER_SWAP_RETURNS_DELTA` set | "Hook can change how much you receive on swaps" |
| `AFTER_ADD_/REMOVE_LIQUIDITY_RETURNS_DELTA` set | "Hook can change what LPs deposit or withdraw" |
| Pool uses the dynamic fee flag | "Fee can change; maximum possible LP fee is 100%" |
| Hook is an upgradeable proxy (1967, UUPS or beacon) | "Code can be replaced; ceiling = everything its permission bits allow" |
| Upgradeable **and** a RETURNS_DELTA bit is set | **Worst case: up to 100% of swap value** (prove on the fork, see M5) |
| No delta bits, no dynamic fee, not upgradeable | "Cannot take a cut of swaps through hook logic" |

## 4. Architecture

```
hooktax/
  packages/indexer/     # TypeScript + viem: Initialize logs -> hooks.json / pools.json
  packages/sim/         # Foundry: fork tests -> sim-results.json
  packages/arkiv/       # TypeScript: writes Hook / Pool / SimResult entities to Arkiv
  packages/api/         # tiny HTTP service: POST /refresh {poolId} -> index + simulate + write
  cre/                  # Chainlink CRE workflow (log trigger on PoolManager Initialize -> calls api)
  apps/web/             # static Vite/React page that READS ARKIV DIRECTLY (no backend needed)
  arkiv/                # required Arkiv judging files (see §7)
  docs/                 # spec, versions, ai.md, testing.md, architecture diagram
```

## 5. Milestones (build in this order; each must work before the next starts)

### M0: Setup (≤1h)
- Monorepo scaffold, `.env.example` (`MAINNET_RPC_URL`, `ARKIV_PRIVATE_KEY`, etc.), `docs/versions.md`, `docs/ai.md`, MIT `LICENSE`.
- 🧑 Ask me for: a mainnet RPC URL (archive access preferred) and a funded Arkiv testnet key.

### M1: Indexer, the HookAtlas data (≈3h)
- Fetch all `Initialize` logs from the PoolManager deployment block to latest, in chunks that respect RPC limits. Cache to disk and make re-runs incremental.
- For each unique hook, collect:
  - permission bits, decoded
  - bytecode size and hash
  - proxy type and implementation address (EIP-1967 / UUPS / beacon)
  - `owner()` if callable
  - number of pools and the list of PoolIds
  - first-seen block
  - whether any of its pools use the dynamic fee
- Output `data/hooks.json` and `data/pools.json`.
- **Use only onchain data.** Do NOT import Sourcify data (excluded by Arkiv's rules), and do not copy Etherscan content.
- Test: unit tests for bit decoding (including an all-flags address and a zero-flags address).

### M2: Arkiv mirror and web page. HookAtlas MVP, submittable on its own (≈3h)
- Entities: `Hook`, `Pool`, `SimResult`. Fields must be filterable the way people search: permissions, `isUpgradeable`, `hasDynamicFeePool`, `canAffectSwapAmounts`, `poolCount`, `lastMeasuredTakeBps`.
- Ownership: our writer wallet. Expiry:
  - `Hook` and `Pool` refresh on each import.
  - `SimResult` **expires after 7 days**, so stale safety numbers disappear instead of misleading people. This is a core "why Arkiv" point.
- Web page reads from Arkiv directly. It needs filters (e.g., "hooks that can change swap amounts", "upgradeable hooks") and a hook detail view.
- Write `README` entries: writer wallet address(es) and one copy-pasteable Arkiv query.
- ✅ Commit and tag `v0.1-hookatlas`. **This alone qualifies for Arkiv + Uniswap + (after M3) Chainlink.**

### M3: Chainlink CRE workflow (≈2h)
- Use an EVM log trigger on PoolManager `Initialize` with `hooks != 0`. The workflow calls `POST /refresh` on our API (HTTP capability) and checks the result.
- Run a successful `cre` CLI simulation, save its output to `docs/cre-simulation.md`, and explain in the README why CRE is the orchestration layer.
- 🧑 I will run `cre login` when you ask.

### M4: Measured take on the fork (≈5h)
- Foundry fork tests against the real mainnet PoolManager, using v4-core test routers (e.g., `PoolSwapTest`). Fund the swapper with `deal` (handle native ETH pools).
- Select pools: hooked pools that have liquidity. Start with the 25 hooks that have the most pools, then expand if time allows.
- For each pool, swap a small fixed USD-equivalent amount in **both directions**. Use `vm.recordLogs()` to capture all ERC-20 `Transfer` events, and snapshot ERC-6909 claim balances (`PoolManager.balanceOf(account, currencyId)`) before and after.
- Attribute value flows to: swapper, PoolManager, LPs (pool fees), **hook address**, **hook owner**, and **other addresses**.
- `measuredTakeBps` = value to hook + owner + others, divided by swap input, excluding normal LP fees. Report the LP fee separately.
- Handle failures (hook reverts, missing liquidity, unsupported tokens) as explicit statuses, never as silent zeros.
- Output `data/sim-results.json` and write `SimResult` entities to Arkiv.

### M5: Worst case, proved on the fork (≈4h)
- **Planted demo hook (guaranteed demo).** Write `SneakyFeeHook`:
  - an upgradeable hook whose address is mined (v4-periphery `HookMiner`) to have `BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA`
  - v1 takes 0.3%
  - deploy it on the fork, create a pool and add liquidity
  - show HookTax measures 0.3%
  - impersonate the admin, upgrade to v2, which takes 100% of the swap input
  - swap again and show HookTax measures the new take
- **Real hooks.** For mainnet hooks that are upgradeable or owner-controlled:
  - impersonate the admin or owner on the fork
  - try known admin selectors: fee setters, `upgradeTo`, `upgradeToAndCall`, pause
  - for dynamic-fee pools, set the maximum fee through whatever path the hook exposes, if one exists
  - re-measure
  - only report what actually executed; record attempted but failed probes as "not demonstrated".
- Show "today vs worst case" in the UI and the CLI.

### M6: CLI and polish (≈2h)
- `hooktax check <poolId|hookAddress>` prints a plain-English card:
  - measured take today
  - LP fee
  - capability rules triggered
  - demonstrated worst case
- Web: the same card, plus the Arkiv query that produced it.

### M7: Submission artifacts (≈3h, do not skip)
- **README:** one-line pitch, live link, video link, selected partner tracks, architecture diagram, setup from a clean clone, and exact file/line pointers for the Uniswap, Arkiv and CRE integrations. Include limits: not an audit; fork results are point-in-time; unverified bytecode limits which admin probes can be tried.
- **`FEEDBACK.md`** for Uniswap. 🧑 I submit the Uniswap Developer Feedback Form with its link.
- **`/arkiv` judging files** (see §7).
- **`docs/testing.md`:** what ran, the commands, and the results.
- **`docs/ai.md`:** complete AI attribution.
- **Demo script for a 2:45 video.** 🧑 I record it with my own voice; no AI voiceover, no phone recording.

## 6. Demo storyline (build toward this)

1. **Problem (10s):** "Every v4 pool can run code on your swap. Which ones take a cut, and which could start tomorrow?"
2. **HookAtlas (30s):** filter "hooks that can change swap amounts" and "upgradeable". These are live Arkiv queries.
3. **Measured take (45s):** pick a real pool and show the traced money flow.
4. **Worst case (50s):** `SneakyFeeHook`. Today it takes 0.3%. Upgrade it on the fork, and it now takes 100%. HookTax flags the risk *before* the upgrade, from address bits plus proxy detection.
5. **Live refresh (20s):** CRE simulation detects a new hooked pool and triggers the refresh.
6. **Close (10s):** "Know what a hook can take before you trade."

## 7. Arkiv judging files (required paths)

Fill these with real numbers, links and runnable queries, not marketing:
- `/arkiv/schema.md`: entities, fields we query, owner, expiry rules and why.
- `/arkiv/friction.md`: honest problems we hit, with what we expected, what happened and how to reproduce. 🧑 I review and add my own notes.
- `/arkiv/reach.md`: who depends on this data (wallets, routers, LPs, aggregators) and who would use our copy after Mumbai. Include hook and pool counts from our import.
- `/arkiv/why-arkiv.md`: what is lost if this sat in Postgres:
  - anyone can query it without our API
  - expiring `SimResult` means stale safety data disappears
  - the data is wallet-owned and verifiable
- `/arkiv/data-quality.md`: freshness (incremental import + CRE trigger), how to re-run the importer, and filter coverage.
- The README must state the data source (public onchain events), its license status, and the writer wallet(s).

## 8. Definition of done

- [ ] `v0.1-hookatlas` tag works end to end (index, then Arkiv, then a web query).
- [ ] CRE simulation output saved and linked.
- [ ] Measured take for at least 10 real hooked pools, with explicit failure statuses for the rest.
- [ ] `SneakyFeeHook` demo runs from one command: `make demo`.
- [ ] Fresh clone + `.env` + documented commands reproduce everything.
- [ ] No secrets in git; no mainnet transactions anywhere.
- [ ] README, FEEDBACK.md, `/arkiv/*`, `docs/ai.md`, and `docs/testing.md` complete.

## 9. If time runs out

Priority order: **M0 → M1 → M2 (submit-ready) → M3 → M5 planted-hook demo → M4 → M6.** If you are behind schedule, tell me and cut M4's real-pool coverage before cutting the planted-hook demo or the docs.

Start with M0 now. Show me the plan for M1 in 5 bullet points before writing indexer code.
