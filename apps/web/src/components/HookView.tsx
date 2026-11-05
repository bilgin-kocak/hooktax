import {
  HOOK_FLAGS,
  PROXY_TYPE_LABEL,
  buildCard,
  currencyLabel,
  formatBps,
  formatFee,
  permissionLabel,
  shortAddress,
  type CardSim,
  type HookPermissions,
  type ProxyType,
} from "@hooktax/core";
import type { Address } from "viem";
import { decodeDetails, hookDetailQuery, poolsForHookQuery, simsForHookQuery } from "../arkiv";
import { useArkivQuery, val } from "../useArkiv";
import { HookCard } from "./Card";
import { QueryBox } from "./QueryBox";

type Row = Record<string, unknown> & { $key: string; $expiresAt?: bigint };

interface HookDetails {
  codeSize: number;
  proxy: {
    implementation: string | null;
    implementationCodeHash: string | null;
    admin: string | null;
    beacon: string | null;
    upgradeAuthority: string | null;
    upgradeAuthoritySource: string | null;
  };
  ownerIsContract: boolean | null;
  dynamicFeePoolCount: number;
  samplePoolIds: string[];
}

export function simFromRow(r: Row): CardSim & { simId: string; poolId: string; isDemo: boolean } {
  const num = (n: string) => {
    const v = val<string>(r, n);
    return v === undefined ? null : Number(v);
  };
  const details = decodeDetails<{ label?: string | null }>(r.details as { value: `0x${string}` } | undefined);
  return {
    simId: val<string>(r, "simId") ?? "",
    poolId: val<string>(r, "poolId") ?? "",
    isDemo: Boolean(val<boolean>(r, "isDemo")),
    scenario: val<string>(r, "scenario") ?? "",
    status: val<string>(r, "status") ?? "",
    measuredTakeBps: num("measuredTakeBps"),
    lpFeeBps: num("lpFeeBps"),
    forkBlock: Number(val<bigint>(r, "forkBlock") ?? 0n),
    measuredAt: Number(val<bigint>(r, "measuredAt") ?? 0n),
    label: details?.label ?? null,
  };
}

const etherscan = (a: string) => `https://etherscan.io/address/${a}`;

export function HookView({ address }: { address: Address }) {
  const hookQ = useArkivQuery(() => hookDetailQuery(address), [address]);
  const poolsQ = useArkivQuery(() => poolsForHookQuery(address), [address]);
  const simsQ = useArkivQuery(() => simsForHookQuery(address), [address]);

  const row = hookQ.data?.entities?.[0] as Row | undefined;
  const pools = (poolsQ.data?.entities ?? []) as unknown as Row[];
  const sims = ((simsQ.data?.entities ?? []) as unknown as Row[]).map(simFromRow);

  if (hookQ.loading) return <main><p className="muted">Querying Arkiv…</p></main>;
  if (hookQ.error) return <main><p className="error">Arkiv query failed: {hookQ.error}</p><QueryBox text={hookQ.text} /></main>;
  if (!row) {
    return (
      <main>
        <p>No HookAtlas entity for <span className="mono">{address}</span> from this writer.</p>
        <QueryBox text={hookQ.text} />
      </main>
    );
  }

  const permissions = Object.fromEntries(HOOK_FLAGS.map((f) => [f.name, Boolean(val<boolean>(row, f.name))])) as HookPermissions;
  const details = decodeDetails<HookDetails>(row.details as { value: `0x${string}` } | undefined);
  const proxyType = (val<string>(row, "proxyType") ?? "none-detected") as ProxyType;
  const isUpgradeable = Boolean(val<boolean>(row, "isUpgradeable"));
  const owner = val<string>(row, "owner");
  const today = sims.filter((s) => s.scenario === "today").sort((a, b) => b.measuredAt - a.measuredAt)[0] ?? null;
  const demonstrations = sims.filter((s) => s.scenario !== "today");
  const card = buildCard({
    hook: { address, permissions, isUpgradeable, hasDynamicFeePool: Boolean(val<boolean>(row, "hasDynamicFeePool")), proxyType },
    today,
    demonstrations,
  });

  return (
    <main>
      <p><a href="#/">← HookAtlas</a></p>
      <h2 className="mono break">{address}</h2>
      <p className="muted">
        <a href={etherscan(address)} target="_blank" rel="noreferrer">view on Etherscan</a> · permission bits 0x
        {(val<number>(row, "permissionBits") ?? 0).toString(16).padStart(4, "0")} · first seen in block{" "}
        {String(val<bigint>(row, "firstSeenBlock") ?? "")} · {val<number>(row, "poolCount")} pools ({val<number>(row, "activePoolCount")} with liquidity)
      </p>

      <HookCard card={card} />

      <section>
        <h3>Permissions (fixed in the address)</h3>
        <div className="perms-grid">
          {HOOK_FLAGS.map((f) => (
            <span key={f.name} className={`perm ${permissions[f.name] ? "set" : ""} ${f.name.endsWith("ReturnsDelta") && permissions[f.name] ? "delta" : ""}`}>
              {permissionLabel(f.name)}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3>Code and control</h3>
        <dl className="facts">
          <dt>Proxy</dt>
          <dd>{PROXY_TYPE_LABEL[proxyType] ?? proxyType}</dd>
          {details?.proxy.implementation && (<><dt>Implementation</dt><dd className="mono"><a href={etherscan(details.proxy.implementation)} target="_blank" rel="noreferrer">{details.proxy.implementation}</a></dd></>)}
          {details?.proxy.upgradeAuthority && (<><dt>Can upgrade</dt><dd className="mono">{details.proxy.upgradeAuthority} <span className="muted">({details.proxy.upgradeAuthoritySource})</span></dd></>)}
          <dt>owner()</dt>
          <dd className="mono">{owner ?? <span className="muted">not callable</span>}{owner && details?.ownerIsContract !== null ? <span className="muted"> ({details?.ownerIsContract ? "contract" : "EOA"})</span> : null}</dd>
          <dt>Code</dt>
          <dd>{details ? `${details.codeSize.toLocaleString()} bytes` : "?"} <span className="muted mono small">{val<string>(row, "codeHash") ?? ""}</span></dd>
          <dt>Entity</dt>
          <dd className="small muted">expires at Arkiv block {String(row.$expiresAt ?? "")} unless the next import refreshes it</dd>
        </dl>
      </section>

      <section>
        <h3>Fork measurements (live SimResults, expire after 7 days)</h3>
        {simsQ.error && <p className="error">{simsQ.error}</p>}
        {sims.length === 0 ? (
          <p className="muted">No live measurement for this hook.</p>
        ) : (
          <div className="tablewrap"><table>
            <thead><tr><th>Scenario</th><th>Status</th><th className="num">Take</th><th className="num">LP fee</th><th>Pool</th><th className="num">Fork block</th></tr></thead>
            <tbody>
              {sims.map((s) => (
                <tr key={s.simId}>
                  <td>{s.label ?? s.scenario}{s.isDemo ? <span className="badge info"> demo</span> : null}</td>
                  <td>{s.status}</td>
                  <td className="num">{s.measuredTakeBps !== null ? formatBps(s.measuredTakeBps) : "–"}</td>
                  <td className="num">{s.lpFeeBps !== null ? formatBps(s.lpFeeBps) : "–"}</td>
                  <td className="mono small">{shortAddress(s.poolId)}</td>
                  <td className="num">{s.forkBlock}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <QueryBox text={simsQ.text} title="SimResult query" />
      </section>

      <section>
        <h3>Pools with liquidity</h3>
        {pools.length === 0 ? (
          <p className="muted">No pool of this hook had in-range liquidity at the last import.</p>
        ) : (
          <div className="tablewrap"><table>
            <thead><tr><th>Pool</th><th>Pair</th><th>Fee</th><th className="num">Liquidity</th></tr></thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.$key}>
                  <td className="mono small">{shortAddress(val<string>(p, "poolId") ?? "")}</td>
                  <td>{currencyLabel(val<string>(p, "currency0") ?? "", val<string>(p, "symbol0") ?? null)} / {currencyLabel(val<string>(p, "currency1") ?? "", val<string>(p, "symbol1") ?? null)}</td>
                  <td>{formatFee(val<number>(p, "fee") ?? 0)}</td>
                  <td className="num">{String(val<bigint>(p, "liquidity") ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <QueryBox text={poolsQ.text} title="Pool query" />
      </section>

      <QueryBox text={hookQ.text} title="Hook query" />
    </main>
  );
}
