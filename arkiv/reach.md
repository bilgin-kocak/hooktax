# Reach: who depends on this data

## What HookAtlas mirrors

From one import of Ethereum mainnet at block **26,347,887** (PoolManager deploy block 21,688,329 →
latest finalized):

| | count |
|---|---|
| v4 pools seen (`Initialize` events) | 186,872 |
| …with a hook | 47,130 |
| …hooked pools with live liquidity | 24,535 |
| unique hooks | 11,242 |
| hooks with code | 11,226 |
| **upgradeable hooks** | **687** |
| **hooks that can change swap amounts** (swap RETURNS_DELTA bit) | **8,716** |
| hooks with a dynamic-fee pool | 829 |
| **hooks that are upgradeable AND can change swap amounts** (worst case: 100% of swap value) | **35** |
| hooks measured on a fork so far | 20 pools |

Proxy breakdown of the 687 upgradeable hooks: 608 beacon, 50 UUPS, 28 transparent, 1 plain
EIP-1967 (plus 24 EIP-1167 clones, which are *not* upgradeable and counted separately).

## Who depends on "what can this hook take?"

- **Swappers / wallets.** Before routing a swap through a v4 pool, a wallet can ask HookAtlas
  whether the pool's hook can change the amount received, and what it measured last. The 8,716
  swap-delta hooks are exactly the ones where "price impact" is not the whole story.
- **LPs.** Before adding liquidity, an LP can check `canAffectLpAmounts` and whether the hook is
  upgradeable — a hook whose code can be replaced can change the deal after they deposit.
- **Routers and aggregators.** 1inch/CoW-style routers choosing among v4 pools can treat an
  upgradeable swap-delta hook as a risk input, not just a fee.
- **Explorers and risk dashboards.** A read-only, wallet-owned directory they can query directly,
  without integrating our API.

## Who would use our copy after Mumbai

Because the data is wallet-owned and queryable without our server (see [`why-arkiv.md`](why-arkiv.md)),
anyone above can build on the Arkiv entities directly, with the queries in [`schema.md`](schema.md).
Another team can also re-run `make index && make arkiv-sync` under their own writer and publish an
independent, equally-authoritative copy.

## Cost of a full mirror (measured)

The first `make arkiv-estimate` against the live Rabdi node projected **35,800 entities** (11,242
hooks + 24,535 active pools + the SimResults) at **~580k gas/op**, ≈ **20.8 tGLM** at 1 gwei. That
sample was all hook entities, which carry more `details`. Measured during the real write: **~477k
gas per hook and ~337k per pool**, so the complete mirror cost **≈ 13.7 tGLM** over 2,044
transactions (14–15 hooks or 20 pools per transaction; more would exceed the node's 128 KiB
transaction cap). This is a real sizing input: the faucet gives less per claim, so a complete mirror is
staged across claims, or scoped (e.g. the upgradeable + swap-delta hooks and their active pools
first). HookTax is built for incremental sync — `contentHash` means a re-import only rewrites hooks
that actually changed, and the CRE workflow adds single pools as they appear.
