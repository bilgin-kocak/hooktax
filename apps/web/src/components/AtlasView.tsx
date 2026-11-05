import { useEffect, useState } from "react";
import { HOOK_FLAGS, PROXY_TYPE_LABEL, formatBps, permissionLabel, shortAddress, type HookFlagName, type ProxyType } from "@hooktax/core";
import { EMPTY_FILTER, hookListQuery, type HookFilter, type HookListRow, type HookSort } from "../arkiv";
import { PAGE_SIZE } from "../config";
import { useArkivQuery } from "../useArkiv";
import { QueryBox } from "./QueryBox";

const TOGGLES: Array<{ key: keyof HookFilter; label: string; hint: string }> = [
  { key: "swapDelta", label: "Can change swap amounts", hint: "BEFORE/AFTER_SWAP_RETURNS_DELTA bit set" },
  { key: "upgradeable", label: "Upgradeable", hint: "EIP-1967 / UUPS / beacon / diamond proxy" },
  { key: "worstSwap100", label: "Worst case: 100% of swap value", hint: "upgradeable AND a swap delta bit" },
  { key: "dynamicFee", label: "Dynamic-fee pool", hint: "a pool uses fee flag 0x800000" },
  { key: "lpDelta", label: "Can change LP amounts", hint: "liquidity RETURNS_DELTA bit set" },
  { key: "active", label: "Has live liquidity", hint: "at least one pool with in-range liquidity" },
  { key: "measured", label: "Measured on a fork", hint: "a live SimResult exists (expires after 7 days)" },
];

const SORTS: Array<{ key: HookSort; label: string }> = [
  { key: "poolCount", label: "Most pools" },
  { key: "activePoolCount", label: "Most pools with liquidity" },
  { key: "lastMeasuredTakeBps", label: "Highest measured take" },
  { key: "firstSeenBlock", label: "Newest" },
];

const WORST_LABEL: Record<string, { text: string; tone: string }> = {
  "swap-100": { text: "up to 100%", tone: "risk" },
  "fee-100": { text: "fee up to 100%", tone: "warn" },
  "code-bound": { text: "code-bound", tone: "warn" },
  none: { text: "no cut", tone: "ok" },
};

export function AtlasView() {
  const [filter, setFilter] = useState<HookFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<HookSort>("poolCount");
  const [page, setPage] = useState(0);
  const [hookInput, setHookInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");

  // Debounce the address inputs.
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, hook: hookInput, owner: ownerInput })), 400);
    return () => clearTimeout(t);
  }, [hookInput, ownerInput]);
  useEffect(() => setPage(0), [filter, sort]);

  const q = useArkivQuery(() => hookListQuery(filter, sort, page), [filter, sort, page]);
  const rows = (q.data?.entities ?? []) as HookListRow[];
  const total = q.data?.count !== undefined ? Number(q.data.count) : null;

  const toggle = (k: keyof HookFilter) => setFilter((f) => ({ ...f, [k]: !f[k] }));
  const togglePerm = (p: HookFlagName) =>
    setFilter((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }));

  return (
    <main>
      <section className="intro">
        <h2>HookAtlas</h2>
        <p>
          Every Uniswap v4 hook on Ethereum mainnet, its permissions, upgradeability and worst case, read live from{" "}
          <a href="https://arkiv.network" target="_blank" rel="noreferrer">Arkiv</a>. Pick filters; each one is an Arkiv
          query predicate.
        </p>
      </section>

      <section className="filters">
        <div className="chips">
          {TOGGLES.map((t) => (
            <button key={t.key} className={`chip ${filter[t.key] ? "on" : ""}`} title={t.hint} onClick={() => toggle(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <details className="perms">
          <summary>Permission bits {filter.permissions.length > 0 ? `(${filter.permissions.length} required)` : ""}</summary>
          <div className="chips">
            {HOOK_FLAGS.map((f) => (
              <button key={f.name} className={`chip mono ${filter.permissions.includes(f.name) ? "on" : ""}`} onClick={() => togglePerm(f.name)}>
                {permissionLabel(f.name)}
              </button>
            ))}
          </div>
        </details>
        <div className="row gap wrap">
          <input placeholder="Hook address 0x…" value={hookInput} onChange={(e) => setHookInput(e.target.value)} />
          <input placeholder="Owner address 0x…" value={ownerInput} onChange={(e) => setOwnerInput(e.target.value)} />
          <label>
            Sort{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as HookSort)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => { setFilter(EMPTY_FILTER); setHookInput(""); setOwnerInput(""); }}>Reset</button>
        </div>
      </section>

      <QueryBox text={q.text} />

      {q.error && <p className="error">Arkiv query failed: {q.error}</p>}
      <p className="muted">
        {q.loading ? "Querying Arkiv…" : total !== null ? `${total.toLocaleString()} hooks match` : ""}
        {q.data && q.data.skipped > 0 ? ` (${q.data.skipped} entities skipped: did not fit the schema)` : ""}
      </p>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Hook</th>
              <th>Swap delta</th>
              <th>Proxy</th>
              <th>Worst case</th>
              <th className="num">Pools (live / all)</th>
              <th className="num">Measured take</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const wc = WORST_LABEL[r.worstCase.value] ?? { text: r.worstCase.value, tone: "" };
              return (
                <tr key={r.$key} onClick={() => (location.hash = `#/hook/${r.hook.value}`)} className="clickable">
                  <td className="mono">
                    <a href={`#/hook/${r.hook.value}`}>{shortAddress(r.hook.value)}</a>
                    <span className="muted small"> 0x{r.permissionBits.value.toString(16).padStart(4, "0")}</span>
                  </td>
                  <td>{r.canAffectSwapAmounts.value ? <span className="badge warn">yes</span> : <span className="muted">no</span>}</td>
                  <td className="small">{r.isUpgradeable.value ? <span className="badge warn">{PROXY_TYPE_LABEL[r.proxyType.value as ProxyType] ?? r.proxyType.value}</span> : <span className="muted">none detected</span>}</td>
                  <td><span className={`badge ${wc.tone}`}>{wc.text}</span></td>
                  <td className="num">{r.activePoolCount.value} / {r.poolCount.value}</td>
                  <td className="num">{r.lastMeasuredTakeBps ? formatBps(Number(r.lastMeasuredTakeBps.value)) : <span className="muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row gap pager">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="muted">
          page {page + 1}
          {total !== null ? ` of ${Math.max(1, Math.ceil(total / PAGE_SIZE))}` : ""}
        </span>
        <button disabled={total !== null ? (page + 1) * PAGE_SIZE >= total : rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}
