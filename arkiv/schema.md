# Arkiv schema

HookTax mirrors its HookAtlas to Arkiv (Rabdi testnet, chain `7794095`). Four schemas, defined in
[`packages/arkiv/src/schemas.ts`](../packages/arkiv/src/schemas.ts) and written by
[`packages/arkiv/src/sync.ts`](../packages/arkiv/src/sync.ts).

Everything HookTax writes is owned by one **writer wallet**. Arkiv is a public database — anyone can
write an entity with our schema names — so every reader (the web app, the CLI) filters by
`.ownedBy(writer)`. The writer address is in the repo root `README.md` and in `.env`.

## Entities

### `hooktax.v1.hook` — one per Uniswap v4 hook on Ethereum mainnet

Indexed columns (these are the ways people search HookAtlas):

| Column | Type | Query it answers |
|---|---|---|
| `hook` | addr | this exact hook |
| `permissionBits` | i32 | hooks with a given permission mask |
| `beforeSwap` … `afterRemoveLiquidityReturnsDelta` (14 bool) | bool | hooks with a specific permission bit |
| `canAffectSwapAmounts` | bool | **"hooks that can change how much I receive on a swap"** |
| `canAffectLpAmounts` | bool | hooks that can change LP deposits/withdrawals |
| `isUpgradeable` | bool | **"upgradeable hooks"** |
| `hasDynamicFeePool` | bool | hooks with a dynamic-fee pool |
| `worstCase` | str | `swap-100` / `fee-100` / `code-bound` / `none` |
| `proxyType` | str | `eip1967-uups`, `eip1967-beacon`, … |
| `poolCount`, `activePoolCount` | i32 | most-used hooks; hooks with live liquidity |
| `lastMeasuredTakeBps` | dec | highest measured take; "measured" filter (`EXISTS`) |
| `owner` | addr | hooks owned by an address |
| `codeHash` | str | hooks sharing bytecode |
| `status` | str | `ok` / `no-code` |

Stored, not indexed: `firstSeenBlock` (u64), `contentHash` (str, lets an import skip unchanged
hooks), `details` (bytes, JSON: proxy implementation/admin/beacon, upgrade authority, code size,
owner kind, sample pool ids).

31 columns — Arkiv's limit for a named schema (the `arkiv.schema` tag is the 32nd attribute).

### `hooktax.v1.pool` — one per hooked pool with live liquidity

Indexed: `poolId`, `hook`, `currency0/1`, `symbol0/1`, `fee`, `isDynamicFee`, `hasLiquidity`,
`hookCanAffectSwapAmounts`, `hookIsUpgradeable`, `hookWorstCase`, `lastMeasuredTakeBps`. Stored:
`tickSpacing`, `lpFee`, `liquidity` (u256), `decimals0/1`, `createdBlock`, `contentHash`.

### `hooktax.v1.simresult` — one fork measurement

Indexed: `simId`, `poolId`, `hook`, `scenario`, `status`, `measuredTakeBps`, `isDemo`, `forkBlock`.
Stored: per-direction takes, `lpFeeBps`, `measuredAt`, `details` (bytes: every traced flow with its
role). Written **readonly** (an immutable measurement).

### `hooktax.v1.import` — one per import run

Provenance and freshness: `toBlock`, counts, `generatedAt`, `source`. Lets a reader see how fresh
the atlas is (the web app's header reads the latest one).

## Ownership and expiry

| Schema | Owner | Lifetime | Why |
|---|---|---|---|
| `hook` | writer | 30 days, refreshed/extended on each import | long-lived facts |
| `pool` | writer | 30 days, refreshed on each import | long-lived facts |
| `simresult` | writer | **7 days**, readonly | **a measured take is only true for a point in time; after 7 days a stale safety number should disappear rather than mislead** |
| `import` | writer | max (≈182 days) | provenance should outlive the data it describes |

The 7-day `SimResult` expiry is the core "why Arkiv" point: the safety numbers delete themselves.
See [`why-arkiv.md`](why-arkiv.md).

## One copy-pasteable query

"Hooks that can change swap amounts and whose code can be replaced" — the headline HookTax risk —
owned by the writer, highest measured take first:

```
arkiv.schema = str('hooktax.v1.hook') AND $owner = addr(<WRITER>) AND canAffectSwapAmounts = true AND isUpgradeable = true ORDER BY poolCount:i32 DESC
```

As a raw JSON-RPC call (no SDK; replace `<WRITER>` and, for a higher rate limit, add your access key
to the URL):

```bash
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["arkiv.schema = str('"'"'hooktax.v1.hook'"'"') AND $owner = addr(<WRITER>) AND canAffectSwapAmounts = true AND isUpgradeable = true",{"select":{"key":true,"attributes":true},"limit":"0x19"}]}'
```

The web app shows the exact query behind every view (the "Arkiv query" box) with a copy-paste curl.
