# cre: Chainlink CRE workflow (M3)

`hooktax-refresh` keeps HookAtlas fresh without a HookTax server watching the chain.

- **Trigger:** an EVM log trigger on the Uniswap v4 PoolManager (`0x000000000004444c5dc75cB358380D2e3dE08A90`,
  Ethereum mainnet), with topic0 = `Initialize` and `CONFIDENCE_LEVEL_FINALIZED`.
- **Filter in code:** `hooks` is not an indexed event field, so the trigger cannot express
  `hooks != 0`. The handler decodes the log and skips hookless pools (`workflow.ts`, `onInitialize`).
- **Action:** one HTTP POST to the HookTax API `/refresh {poolId, txHash}`, using the bearer token
  from the `REFRESH_API_TOKEN` secret. `cacheSettings` makes one node call the API while the other
  nodes reuse the response. The handler then **checks the answer**: `ok`, the same `poolId`, and
  the same permission bits as the event's hook address. Any mismatch fails the run.
- **Writes:** none onchain. The workflow only reads mainnet logs.

Files: `project.yaml` (RPC per target), `secrets.yaml` (secret ID to env var),
`hooktax-refresh/workflow.yaml`, `workflow.ts`, `main.ts` and `workflow.test.ts`.

```bash
cd cre/hooktax-refresh && bun install && bun test
```

```bash
make cre-build
```

`cre workflow simulate` needs a CRE account, through `cre login` (browser) or `CRE_API_KEY`
(headless). See `make cre-sim` and `docs/cre-simulation.md`.
