// Build-time config (VITE_* from the repo .env) with URL overrides, so anyone can point the page
// at another writer and check that the data is what that wallet published.
//   ?writer=0x...   read entities owned by this address instead of the default writer

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);

/** The HookTax writer on Rabdi. Public by design: readers must filter by it (.ownedBy). */
export const DEFAULT_WRITER = "0x4aAa2e7d4693fe0648BB8767381266fe09497c2A";

/** ?writer= wins, then the build's VITE_ARKIV_WRITER_ADDRESS, then the HookTax writer. */
export function resolveWriter(param: string | null, env: string | undefined): string {
  return (param?.trim() || env?.trim() || DEFAULT_WRITER).trim();
}

export const WRITER = resolveWriter(params.get("writer"), import.meta.env.VITE_ARKIV_WRITER_ADDRESS);
/** Browser access key, locked to the site's origin in the Arkiv Hub. Empty = public endpoint. */
export const ACCESS_KEY = (import.meta.env.VITE_ARKIV_ACCESS_KEY ?? "").trim();
export const RPC_URL = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
export const EXPLORER = "https://rabdi.explorer.arkiv.network";
export const REPO_URL = "https://github.com/bilgin-kocak/hooktax";
export const PAGE_SIZE = 25;
