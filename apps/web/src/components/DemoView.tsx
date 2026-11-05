import { buildCard, decodePermissions, formatBps, shortAddress } from "@hooktax/core";
import { demoSimsQuery, measuredSimsQuery } from "../arkiv";
import { useArkivQuery } from "../useArkiv";
import { HookCard } from "./Card";
import { simFromRow } from "./HookView";
import { QueryBox } from "./QueryBox";

type Row = Record<string, unknown> & { $key: string };

/** The planted SneakyFeeHook story, read from Arkiv SimResults flagged isDemo. */
export function DemoView() {
  const q = useArkivQuery(() => demoSimsQuery(), []);
  const sims = ((q.data?.entities ?? []) as unknown as Row[]).map(simFromRow);
  const today = sims.filter((s) => s.scenario === "today").sort((a, b) => b.measuredAt - a.measuredAt)[0] ?? null;
  const after = sims.filter((s) => s.scenario !== "today");
  const hook = (q.data?.entities?.[0] as Row | undefined)?.hook as { value: string } | undefined;

  return (
    <main>
      <p><a href="#/">← HookAtlas</a></p>
      <h2>Worst case, proved on a fork: SneakyFeeHook</h2>
      <p>
        SneakyFeeHook is a <strong>planted demo hook</strong>. It exists only on a local mainnet fork and is not a mainnet
        hook. Its address is mined to have <span className="mono">BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA</span>, and it
        sits behind an upgradeable proxy. HookTax flags the risk <em>before</em> any upgrade: from the address bits plus the
        proxy slot, its worst case is 100% of swap value. Then we upgrade it on the fork and measure again.
      </p>
      {q.error && <p className="error">Arkiv query failed: {q.error}</p>}
      {q.loading && <p className="muted">Querying Arkiv…</p>}
      {!q.loading && sims.length === 0 && <p className="muted">No live demo results (they expire 7 days after `make demo`).</p>}
      {sims.length > 0 && (
        <>
          <div className="compare">
            <div className="tile">
              <div className="muted">Today (v1)</div>
              <div className="big">{today?.measuredTakeBps != null ? formatBps(today.measuredTakeBps) : "–"}</div>
              <div className="muted small">measured take</div>
            </div>
            <div className="arrow">→</div>
            <div className="tile risk">
              <div className="muted">After admin upgrade (v2)</div>
              <div className="big">{after[0]?.measuredTakeBps != null ? formatBps(after[0].measuredTakeBps) : "–"}</div>
              <div className="muted small">measured take</div>
            </div>
          </div>
          <HookCard
            card={buildCard({
              hook: { address: hook?.value ?? "", permissions: decodePermissions(0x88), isUpgradeable: true, hasDynamicFeePool: false, proxyType: "eip1967-uups" },
              today,
              demonstrations: after,
            })}
          />
          <p className="muted small">Demo hook (fork only): <span className="mono">{hook?.value}</span></p>
        </>
      )}
      <QueryBox text={q.text} />
    </main>
  );
}

/** Real mainnet pools measured on the fork, highest take first. */
export function MeasuredView() {
  const q = useArkivQuery(() => measuredSimsQuery(), []);
  const sims = ((q.data?.entities ?? []) as unknown as Row[]).map((r) => ({ ...simFromRow(r), hook: (r.hook as { value: string }).value }));
  return (
    <main>
      <p><a href="#/">← HookAtlas</a></p>
      <h2>Measured take on real pools</h2>
      <p>
        Each row is a swap in both directions through a real hooked pool on a mainnet fork, with every token movement
        traced. Take = value to the hook, its owner or anyone other than the swapper, the PoolManager and LPs, divided by
        the swap input. Results expire after 7 days.
      </p>
      {q.error && <p className="error">Arkiv query failed: {q.error}</p>}
      {q.loading && <p className="muted">Querying Arkiv…</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Hook</th><th>Pool</th><th className="num">Take</th><th className="num">LP fee</th><th className="num">Fork block</th></tr></thead>
        <tbody>
          {sims.map((s) => (
            <tr key={s.simId} className="clickable" onClick={() => (location.hash = `#/hook/${s.hook}`)}>
              <td className="mono"><a href={`#/hook/${s.hook}`}>{shortAddress(s.hook)}</a></td>
              <td className="mono small">{shortAddress(s.poolId)}</td>
              <td className="num">{s.measuredTakeBps !== null ? formatBps(s.measuredTakeBps) : "–"}</td>
              <td className="num">{s.lpFeeBps !== null ? formatBps(s.lpFeeBps) : "–"}</td>
              <td className="num">{s.forkBlock}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <QueryBox text={q.text} />
    </main>
  );
}
