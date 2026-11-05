# @hooktax/api (M3)

The service the Chainlink CRE workflow calls when a new hooked pool appears on mainnet.

| Route | Auth | What it does |
|---|---|---|
| `POST /refresh {poolId, txHash?}` | `Authorization: Bearer $REFRESH_API_TOKEN` | Re-reads the pool's `Initialize` event **onchain** (it never trusts the caller), checks the hook's permission bits and proxy slots, and answers `202 {ok, jobId, poolId, hook, permissionBits, capabilities, worstCase}`. It then queues a job: re-index the pool and hook, simulate it on a fork, and mirror the results to Arkiv. |
| `GET /jobs/:id` | bearer | Job progress, one step at a time (`index`, `simulate`, `mirror`) |
| `GET /health` | none | Liveness check |

Jobs run one at a time, because the Arkiv writer must never send concurrent transactions.

```bash
make api
```
