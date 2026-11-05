# @hooktax/web: HookAtlas page (M2, M6)

A static Vite + React page that reads HookAtlas **directly from Arkiv** in the browser. There is no
HookTax backend: every view runs an Arkiv query (shown in its "Arkiv query" box, with a curl you
can paste) scoped to the HookTax writer with `.ownedBy(writer)`.

Views (hash routes, so it works on any static host):

- `#/`: the atlas, with filters such as "can change swap amounts", "upgradeable", "worst case 100%",
  "dynamic fee", permission bits, hook or owner address, and sorting
- `#/hook/0x…`: hook detail, with the HookTax card (measured take, LP fee, capabilities, worst case),
  pools with liquidity and live SimResults
- `#/measured`: real pools measured on a mainnet fork
- `#/demo`: the planted SneakyFeeHook (fork only), measured today vs after the admin upgrade

Config is read at build time from the repo `.env` (`VITE_ARKIV_WRITER_ADDRESS`,
`VITE_ARKIV_ACCESS_KEY`). `?writer=0x…` in the URL overrides the writer.

```bash
pnpm --filter @hooktax/web dev
```

```bash
pnpm --filter @hooktax/web build
```
