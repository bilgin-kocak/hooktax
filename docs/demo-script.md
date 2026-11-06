# Demo script (2:45 video)

🧑 Record with your own voice. No AI voiceover, no phone recording. Times are targets.

Setup before recording:
- HookAtlas open at the atlas view: **https://bilgin-kocak.github.io/hooktax/** (or `make web`).
- A terminal with `make demo` ready and the repo visible.
- Tab 2: a real measured hook,
  `https://bilgin-kocak.github.io/hooktax/#/hook/0x676E38B66A7547FF685549E4Ad88134aC62200cC`.
- Tab 3: a real hook whose worst case was proved on a fork,
  `https://bilgin-kocak.github.io/hooktax/#/hook/0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf`.
- [`docs/cre-simulation.md`](cre-simulation.md) open, or a terminal ready to run `make cre-sim`
  (with `make api` running).

---

**0:00–0:10 — Problem.**
> "Every Uniswap v4 pool can run a hook — code that executes on your swap. Some take a cut. Some
> could start taking one tomorrow. HookTax answers: what does this pool's hook take from me today,
> and what could it take?"

**0:10–0:40 — HookAtlas (live Arkiv).** On the atlas page.
> "This is HookAtlas: every v4 hook on Ethereum mainnet — 11,242 of them — read live from Arkiv,
> no server of ours in the loop."
Click **"Can change swap amounts"** → "8,716 hooks can change how much you receive." Click
**"Upgradeable"** on top → "and these can be rewritten by their owner." Click **"Worst case: 100%"**.
> "Thirty-five hooks are both: upgradeable and able to change your swap. Each filter is a real Arkiv
> query —" open the **Arkiv query box** — "here's the exact query, and a curl anyone can run."

**0:40–1:25 — Measured take (a real pool).** Open the hook detail tab.
> "Pick a real one. HookTax swapped a small amount through this pool on a mainnet fork, both ways,
> and traced every token movement."
Point at the card: **Measured take today 0.9999%**, **LP fee 0%**, capability rules, permissions.
> "One percent of every swap goes to the hook — separate from the LP fee, which is zero here. These
> are measured numbers from a real swap, not a guess. And it's a measurement, not an audit."

**1:25–2:00 — Worst case, proved.** Switch to the terminal, run `make demo`.
> "The scary part is the hooks that *could* start taking more. Here's SneakyFeeHook — upgradeable,
> and its address has the bit that lets it change swap amounts. From those facts alone, before
> anything happens, HookTax says: worst case, 100% of your swap."
Point at `today (v1): 0.30%`.
> "Today it takes a reasonable 0.3%."
Point at the upgrade line, then `after upgrade (v2): 100%, swapper received 0`.
> "The owner upgrades the code behind the same address — same permissions, new behaviour — and now
> it takes everything. The swapper gets nothing. HookTax flagged this risk *before* the upgrade,
> from the address bits and the proxy slot."

**2:00–2:20 — And on real hooks.** Switch to tab 3.
> "That was our planted hook. So we did it to the real ones. Of the 35 mainnet hooks with this worst
> case, 24 had a pool we could swap through. For 19, impersonating the real upgrade authority on a
> fork turned a take of between 0 and 10% into 100%."
Point at **Demonstrated worst case: 100% … after "authority upgrade (ProxyAdmin.upgradeAndCall)"**.
> "And where we couldn't, it says why: two had renounced their admin, so no one can upgrade them."

**2:20–2:35 — Live refresh (CRE).** Show the `make cre-sim` output (or `docs/cre-simulation.md`).
> "A Chainlink CRE workflow watches the PoolManager. Here it's fed a real pool creation from
> mainnet: it spots the hook, calls our refresh, checks the answer, and the pool is re-indexed and
> re-measured. No server polling the chain."

**2:35–2:45 — Close.** Back on HookAtlas.
> "HookTax. Know what a hook can take — before you trade."

---

Fallback if `make demo` is slow on camera: pre-run it and show the saved card, or show the `#/demo`
page which renders the same 0.3% → 100% story from Arkiv.
