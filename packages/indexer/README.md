# @hooktax/indexer (M1)

Builds the HookAtlas dataset from Ethereum mainnet:

- reads every Uniswap v4 `Initialize` event from the PoolManager
  (`0x000000000004444c5dc75cB358380D2e3dE08A90`, deployed at block 21,688,329) up to the latest block
- decodes each hook's permission bits, detects proxies (EIP-1967 / UUPS / beacon), reads `owner()`
- writes `data/hooks.json` and `data/pools.json`

Uses onchain data only, over JSON-RPC. It reads no Sourcify data and copies no Etherscan content.

Status: planned.
