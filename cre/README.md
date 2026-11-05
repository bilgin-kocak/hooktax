# cre: Chainlink CRE workflow (M3)

An EVM log trigger on PoolManager `Initialize` events. `hooks` is not an indexed event field, so the
`hooks != address(0)` check runs in workflow code, not in the log filter. For each new hooked pool,
the workflow calls `POST /refresh` on the API through the HTTP capability and checks the result.
Run with the `cre` CLI simulator.

Status: planned.
