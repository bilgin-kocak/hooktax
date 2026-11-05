# Versions and verified facts

Spec rule 5: *verify, don't guess*. Each entry says what we pinned or checked, against which
official source or onchain query, and when. Where the spec and an official source disagree, the
source wins and the conflict is noted here.

Checked on **2026-11-05** unless noted.

## Toolchain

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.23.4 | `engines.node >= 22.12` (required by Vitest 4 / Vite 7). `.nvmrc` = 22 |
| pnpm | 10.28.0 | pinned via `packageManager` in the root `package.json` |
| Foundry (forge, anvil, cast, chisel) | 1.5.1-stable, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, built 2025-12-22 | see install note below |
| Bun | 1.4.4 | `@chainlink/cre-sdk` declares `bun >= 1.2.21` (M3) |
| Go | 1.24.7 | fallback language for the CRE workflow (M3) |
| GNU Make | 4.3 | |

**Foundry install note.** `foundryup` could not run in the dev container: GitHub answered HTTP 403 to
the unauthenticated attestation download (`github.com/foundry-rs/foundryup/attestations/...`).
The proxy logged no denial, so the 403 came from GitHub itself. We installed the official release
tarball instead and recorded its checksum. Attestation was **not** verified.

- URL: `https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz`
- sha256: `9cb14a30fa95c1af1cbeb035272baec0e85298dc18e6a45ca7236eca5ce95474`
- Location: extracted to `~/.foundry/bin`. The `Makefile` adds that directory to `PATH`.

## JavaScript libraries

Exact versions with no `^` ranges, and `pnpm-lock.yaml` is committed. `pnpm-workspace.yaml` sets
`minimumReleaseAge: 1440`, so pnpm refuses any version published less than 24 hours ago.

| Package | Pinned | Used by | Added | Why this version |
|---|---|---|---|---|
| typescript | 5.9.3 | all (typecheck) | M0 | 5.9 line over 7.x (the native port, July 2026) for tool compatibility |
| tsx | 4.23.15 | all (run TS) | M0 | latest |
| vitest | 4.1.12 | all (tests) | M0 | `V4` dist-tag. 5.x shipped 2026-11-02, too new for a 36h build |
| @types/node | 22.20.5 | all | M0 | matches Node 22 |
| viem | _pinned in M1_ | indexer | M1 | latest seen: 2.57.16 (2026-11-03) |
| @arkiv-network/sdk | _pinned in M2_ | arkiv, web | M2 | latest seen: 1.0.1 (2026-11-02) |
| vite / react | _pinned in M2_ | web | M2 | plan: Vite 7.3.x (8.3.6 shipped on 2026-11-05) |
| @chainlink/cre-sdk + `cre` CLI | _pinned in M3_ | cre | M3 | SDK latest seen: 1.23.0 (2026-09-29) |

## Solidity dependencies (installed in M4/M5)

| Repo | Ref to pin | Notes |
|---|---|---|
| `Uniswap/v4-core` | tag `v4.0.0` = `e50237c43811bd9b526eff40f26772152a42daba` | the released and deployed version. Constants below are identical on `main` (`bea7f6d1`) |
| `Uniswap/v4-periphery` | a `main` commit, chosen in M5 (head was `c6e4754d` on 2026-11-05) | has no release tags. Source of `HookMiner` |
| `foundry-rs/forge-std` | chosen in M4 (`master` head was `dc647cc0` on 2026-11-05) | |

## Verified facts

### Uniswap v4 on Ethereum mainnet

Source: official deployments page, https://developers.uniswap.org/docs/protocols/v4/deployments
(`docs.uniswap.org/contracts/v4/deployments` now redirects there).

| Fact | Value | How verified |
|---|---|---|
| PoolManager | `0x000000000004444c5dc75cB358380D2e3dE08A90` | official page. Matches spec §2 |
| PoolManager deployment block | **21688329** (2025-01-23 16:16:47 UTC) | not listed on the official page, so found onchain: `eth_getCode` is empty at 21688328 and returns 24,009 bytes at 21688329. The PoolManager's first log is its constructor's `OwnershipTransferred(0x0 → 0x1a9c8182c09f50c8318d769245bea52c32be35bc)` in tx `0x747e0e02b7590eed32cface28e83260884e0b80675f5ae223c6888053aa68528` (from `0x6B93E3bB9C0780C0f9042346Ffc379530a5882c1`, through CREATE2 factory `0x48E516B34A1274f49457b9C6182097796D0498Cb`) |
| PositionManager | `0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e` | official page |
| StateView | `0x7ffe42c4a5deea5b0fec41c94c136cf115597227` | official page |
| V4Quoter | `0x99bd42B2B22e531f283b7F8a86dFf631EB16A9D1` | official page |
| Universal Router | `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` | official page (it also lists 2.1.1 `0x4c82…2cca` and 2.1.2 `0x2361…De85`) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | official page |
| Test routers on mainnet | **none** | the official page lists `PoolSwapTest` / `PoolModifyLiquidityTest` only for testnets, so in M4 we deploy v4-core's test router onto the fork ourselves |

### v4-core constants

Source: `Uniswap/v4-core` at tag `v4.0.0`, diffed against `main`; both are identical.

| Constant | Value | File |
|---|---|---|
| Hook permission flags | `BEFORE_INITIALIZE = 1<<13`, `AFTER_INITIALIZE = 1<<12`, `BEFORE_ADD_LIQUIDITY = 1<<11`, `AFTER_ADD_LIQUIDITY = 1<<10`, `BEFORE_REMOVE_LIQUIDITY = 1<<9`, `AFTER_REMOVE_LIQUIDITY = 1<<8`, `BEFORE_SWAP = 1<<7`, `AFTER_SWAP = 1<<6`, `BEFORE_DONATE = 1<<5`, `AFTER_DONATE = 1<<4`, `BEFORE_SWAP_RETURNS_DELTA = 1<<3`, `AFTER_SWAP_RETURNS_DELTA = 1<<2`, `AFTER_ADD_LIQUIDITY_RETURNS_DELTA = 1<<1`, `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA = 1<<0`. Match spec §2 exactly | `src/libraries/Hooks.sol` |
| `DYNAMIC_FEE_FLAG` | `0x800000`. Matches spec | `src/libraries/LPFeeLibrary.sol` |
| `MAX_LP_FEE` | `1000000` (100%). Matches spec | same |
| `OVERRIDE_FEE_FLAG` | `0x400000`. Not in the spec, but relevant: in a dynamic-fee pool a `beforeSwap` hook can return a per-swap LP fee override | same |
| `Initialize` event | `Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1, uint24 fee, int24 tickSpacing, IHooks hooks, uint160 sqrtPriceX96, int24 tick)`. Matches spec | `src/interfaces/IPoolManager.sol` |
| `Initialize` topic0 | `0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438` | `cast keccak "Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"`. To be checked against a live log in M1 |

`hooks` is **not** an indexed field, so an `eth_getLogs` filter cannot select `hooks != 0`. The
indexer (M1) and the CRE workflow (M3) both decode the data field and filter in code.

### Proxy detection slots

Computed with `cast keccak <label>` minus 1 (EIP-1967).

| Slot | Value | In spec? |
|---|---|---|
| implementation (`eip1967.proxy.implementation`) | `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` | yes, matches |
| admin (`eip1967.proxy.admin`) | `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103` | yes, matches |
| beacon (`eip1967.proxy.beacon`) | `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` | added (needed for beacon detection) |

### Arkiv (Rabdi testnet)

| Fact | Value | How verified |
|---|---|---|
| Chain ID | 7794095 (`0x76edaf`) | `eth_chainId` on `https://rpc.rabdi.db-chain.testnet.arkiv.network`. Matches spec |
| SDK | `@arkiv-network/sdk`, built on viem. The chain object comes from `rabdi({ accessKey })` in `@arkiv-network/sdk/chains` | https://docs.arkiv.network/start-here/clients/ |
| Access key | optional. With an empty key the SDK uses the public RPC, which is "heavily rate limited". Free keys at https://hub.arkiv.network/access-keys. Browser keys should be locked to the site | same page |
| Agent docs index | https://docs.arkiv.network/llms.txt | fetched 2026-11-05 |

Full Arkiv docs and the AI tools at https://hub.arkiv.network/ai-tools are read before any Arkiv
code is written (M2).

### Public mainnet RPCs (used only for these checks)

These were used only to verify the facts above. HookTax itself reads `MAINNET_RPC_URL`.

| Endpoint | Behaviour observed |
|---|---|
| `ethereum-rpc.publicnode.com` | rejects historical `eth_getCode` and older `eth_getLogs` ranges without a personal token |
| `eth.drpc.org` (free) | `eth_getLogs` capped at 10,000 blocks |
| `eth-mainnet.public.blastapi.io` | `eth_getLogs` capped at 10 blocks |
| `mainnet.gateway.tenderly.co` | 10,000-block `eth_getLogs` and historical `eth_getCode` worked. Returns HTTP 429 under bursts |
