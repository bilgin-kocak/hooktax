# Demo script (2:45 video)

🧑 Record with your own voice. No AI voiceover, no phone recording. Times are targets.

Setup before recording:
- `make web` running (HookAtlas open at the atlas view).
- A terminal with `make demo` ready and the repo visible.
- The hook detail page for a real measured hook open in a second tab
  (e.g. `#/hook/0x676E38B66A7547FF685549E4Ad88134aC62200cC`).

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
Point at the card: **Measured take today 1.00%**, **LP fee 0%**, capability rules, permissions.
> "One percent of every swap goes to the hook — separate from the LP fee, which is zero here. These
> are measured numbers from a real swap, not a guess. And it's a measurement, not an audit."

**1:25–2:15 — Worst case, proved.** Switch to the terminal, run `make demo`.
> "The scary part is the hooks that *could* start taking more. Here's SneakyFeeHook — upgradeable,
> and its address has the bit that lets it change swap amounts. From those facts alone, before
> anything happens, HookTax says: worst case, 100% of your swap."
Point at `today (v1): 0.30%`.
> "Today it takes a reasonable 0.3%."
Point at the upgrade line, then `after upgrade (v2): 100%, swapper received 0`.
> "The owner upgrades the code behind the same address — same permissions, new behaviour — and now
> it takes everything. The swapper gets nothing. HookTax flagged this risk *before* the upgrade,
> from the address bits and the proxy slot."

**2:15–2:35 — Live refresh (CRE).** Show `cre/hooktax-refresh/workflow.ts` or the build.
> "A Chainlink CRE workflow watches the PoolManager for new hooked pools and triggers a refresh and
> re-measurement automatically — the atlas stays current with no server polling the chain."

**2:35–2:45 — Close.** Back on HookAtlas.
> "HookTax. Know what a hook can take — before you trade."

---

Fallback if `make demo` is slow on camera: pre-run it and show the saved card, or show the `#/demo`
page which renders the same 0.3% → 100% story from Arkiv.
