# @hooktax/cli (M6)

`hooktax check <poolId|hookAddress>` prints the plain-English HookTax card from the local dataset
(`data/hooks.json`, `data/pools.json`, `data/sim-results.json`): measured take today, LP fee, the
capability rules triggered, the permissions fixed in the hook address, and any demonstrated worst
case. Each card also prints the `arkiv_query` that fetches the same hook from Arkiv, so the result
is verifiable without this tool.

```bash
make check ARG=0x676E38B66A7547FF685549E4Ad88134aC62200cC
```

```bash
make atlas   # one-line dataset summary
```

`--json` emits the card as JSON. The same card is shown in the web app's hook view.
