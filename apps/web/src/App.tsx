import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { latestImportQuery, writerAddress } from "./arkiv";
import { EXPLORER, REPO_URL, WRITER } from "./config";
import { AtlasView } from "./components/AtlasView";
import { DemoView, MeasuredView } from "./components/DemoView";
import { HookView } from "./components/HookView";
import { useArkivQuery, val } from "./useArkiv";

function useHash(): string {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function Freshness() {
  const q = useArkivQuery(() => (writerAddress() ? latestImportQuery() : null), []);
  const row = q.data?.entities?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const at = Number(val<bigint>(row, "generatedAt") ?? 0n);
  return (
    <span className="muted small">
      Import to mainnet block {String(val<bigint>(row, "toBlock"))} ({at ? new Date(at * 1000).toISOString().slice(0, 16).replace("T", " ") : "?"} UTC):{" "}
      {val<number>(row, "hooks")?.toLocaleString()} hooks, {val<number>(row, "hookedPools")?.toLocaleString()} hooked pools
    </span>
  );
}

export function App() {
  const hash = useHash();
  const writer = writerAddress();
  const m = hash.match(/^#\/hook\/(0x[0-9a-fA-F]{40})/);

  let view;
  if (!writer) {
    view = (
      <main>
        <p className="error">
          No writer address configured. Set VITE_ARKIV_WRITER_ADDRESS at build time or add ?writer=0x… to the URL.
          {WRITER ? ` "${WRITER}" is not an address.` : ""}
        </p>
      </main>
    );
  } else if (m && isAddress(m[1]!)) view = <HookView address={getAddress(m[1]!)} />;
  else if (hash.startsWith("#/demo")) view = <DemoView />;
  else if (hash.startsWith("#/measured")) view = <MeasuredView />;
  else view = <AtlasView />;

  return (
    <>
      <header>
        <div className="brand">
          <a href="#/"><strong>HookTax</strong></a>
          <span className="muted"> · know what a hook can take before you trade</span>
        </div>
        <nav className="row gap">
          <a href="#/">HookAtlas</a>
          <a href="#/measured">Measured take</a>
          <a href="#/demo">Worst-case demo</a>
        </nav>
      </header>
      <div className="subheader">
        <Freshness />
        {writer && (
          <span className="muted small">
            Data owned by writer{" "}
            <a className="mono" href={`${EXPLORER}/address/${writer}`} target="_blank" rel="noreferrer">{writer}</a>
          </span>
        )}
      </div>
      {view}
      <footer className="muted small">
        HookTax reports measured take, capabilities and worst cases. It is not an audit. Source: public Ethereum mainnet
        data (Uniswap v4 PoolManager events and contract state), mirrored to Arkiv by the writer above. Fork results are
        point-in-time. <a href={REPO_URL} target="_blank" rel="noreferrer">Code (MIT)</a>
      </footer>
    </>
  );
}
