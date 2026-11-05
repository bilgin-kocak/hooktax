# Why Arkiv, and not Postgres

HookAtlas is a safety dataset: *what can this hook take from me?* Three properties make Arkiv the
right home for it, and each would be lost in a normal database behind our API.

## 1. Anyone can query it without our server

Every view in the HookTax web app is an Arkiv query made **from the browser**, straight to the
Rabdi RPC. There is no HookTax backend in the read path. If HookTax disappears tomorrow, a wallet,
a router, an aggregator or another explorer can keep reading the same data with the same queries —
they are shown in the UI and in [`schema.md`](schema.md). In Postgres the data lives behind our
API, our auth and our uptime; when we stop paying the bill, the safety data is gone.

## 2. Stale safety numbers delete themselves

A measured take is only true for the block it was measured at. A hook can change its fee, or be
upgraded, the next day. A safety number that is quietly six months old is worse than no number: it
is a false reassurance.

`SimResult` entities are written with a **7-day expiration** (and `readonly`, so a measurement is
never silently rewritten). After 7 days Arkiv stops returning them — the node enforces it, not our
code. The web app then shows "no live measurement (fork results expire after 7 days)" instead of a
stale percentage. The CRE workflow (and `make measure`) refresh them before they lapse.

In Postgres we would have to build and correctly run a TTL sweeper, and every reader would have to
trust that we did. Here, expiry is a property of the data itself: a reader can check `$expiresAt`
and know the number is current without trusting us at all.

## 3. The data is wallet-owned and verifiable

Every entity is owned by the HookTax writer wallet, published in the README. A reader filters
`.ownedBy(writer)` and knows the row came from that wallet — not from anyone else who wrote an
entity with the same schema name. The provenance is cryptographic, not "because our API said so".
`$creator`, `$createdAt` and `$updatedAt` are there to audit it.

This also means HookAtlas is **forkable**: another team can run our importer, write under their own
wallet, and their copy is just as authoritative as ours. The data is not locked inside our
database.

## What we still keep off Arkiv

Honesty: the raw 50 MB of `data/hooks.json` / `data/pools.json` is committed to the repo, not all
mirrored. Mirroring all 35,800 entities costs ~20.8 tGLM (see [`reach.md`](reach.md)). What belongs
on Arkiv is the **queryable, safety-relevant, expiring** view — permissions, upgradeability, worst
case, and the measured takes — which is exactly what the schemas hold.
