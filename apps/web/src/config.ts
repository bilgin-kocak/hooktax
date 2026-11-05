// Build-time config (VITE_* from the repo .env) with URL overrides, so anyone can point the page
// at another writer and check that the data is what that wallet published.
//   ?writer=0x...   read entities owned by this address instead of the default writer

const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);

export const WRITER = (params.get("writer") ?? import.meta.env.VITE_ARKIV_WRITER_ADDRESS ?? "").trim();
/** Browser access key, locked to the site's origin in the Arkiv Hub. Empty = public endpoint. */
export const ACCESS_KEY = (import.meta.env.VITE_ARKIV_ACCESS_KEY ?? "").trim();
export const RPC_URL = "https://rpc.rabdi.db-chain.testnet.arkiv.network";
export const EXPLORER = "https://rabdi.explorer.arkiv.network";
export const REPO_URL = "https://github.com/bilgin-kocak/hooktax";
export const PAGE_SIZE = 25;
