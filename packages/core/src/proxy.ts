// Proxy classification from raw onchain evidence. This is a pure function, so it is unit-testable;
// the indexer gathers the evidence (storage slots, a few view calls) and passes it in.
//
// What we can detect: EIP-1967 proxies (transparent, UUPS, plain), beacon proxies, EIP-2535
// diamonds, and EIP-1167 clones (which are NOT upgradeable). What we cannot detect: custom upgrade
// schemes (e.g. delegating to an address in a non-standard slot). We therefore label "nothing
// found" as `none-detected`, never as "immutable".

import { EIP1967_IMPLEMENTATION_SLOT } from "./constants";

export type ProxyType =
  | "none-detected"
  | "eip1967" // implementation slot set; upgrade path not identified
  | "eip1967-transparent" // implementation + admin slot set
  | "eip1967-uups" // implementation.proxiableUUID() == implementation slot
  | "eip1967-beacon" // beacon slot set
  | "eip2535-diamond" // facetAddresses() returns facets
  | "eip1167-clone"; // minimal proxy: fixed implementation, not upgradeable

export const PROXY_TYPE_LABEL: Record<ProxyType, string> = {
  "none-detected": "No proxy detected",
  eip1967: "EIP-1967 proxy",
  "eip1967-transparent": "Transparent proxy (EIP-1967)",
  "eip1967-uups": "UUPS proxy (EIP-1967 / EIP-1822)",
  "eip1967-beacon": "Beacon proxy (EIP-1967)",
  "eip2535-diamond": "Diamond (EIP-2535)",
  "eip1167-clone": "Minimal clone (EIP-1167, not upgradeable)",
};

export interface ProxyEvidence {
  /** Runtime bytecode of the hook, 0x-prefixed ("0x" or null when there is no code). */
  code: string | null;
  /** Raw 32-byte values of the three EIP-1967 slots. */
  implementationSlot: string | null;
  adminSlot: string | null;
  beaconSlot: string | null;
  /** Result of `proxiableUUID()` called on the implementation (UUPS check), if it succeeded. */
  implementationProxiableUUID?: string | null;
  /** Result of `implementation()` called on the beacon, if it succeeded. */
  beaconImplementation?: string | null;
  /** Number of facets returned by `facetAddresses()` on the hook, if the call succeeded. */
  diamondFacetCount?: number | null;
}

export interface ProxyInfo {
  type: ProxyType;
  isUpgradeable: boolean;
  implementation: string | null;
  admin: string | null;
  beacon: string | null;
}

/** An address-shaped 32-byte word -> lowercase address; zero or non-address words -> null. */
export function slotToAddress(word: string | null | undefined): string | null {
  if (!word) return null;
  const hex = word.toLowerCase().replace(/^0x/, "");
  if (hex.length === 0 || hex.length > 64 || !/^[0-9a-f]*$/.test(hex)) return null;
  const padded = hex.padStart(64, "0");
  if (/^0+$/.test(padded)) return null;
  // EIP-1967 slots hold a left-padded address. Non-zero upper bytes mean something else is stored.
  if (!padded.startsWith("0".repeat(24))) return null;
  return "0x" + padded.slice(24);
}

const EIP1167_PREFIX = "363d3d373d3d3d363d73";
const EIP1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";

/** EIP-1167 minimal proxy runtime code -> implementation address, else null. */
export function parseEip1167(code: string | null | undefined): string | null {
  if (!code) return null;
  const hex = code.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 90 || !hex.startsWith(EIP1167_PREFIX) || !hex.endsWith(EIP1167_SUFFIX)) {
    return null;
  }
  return "0x" + hex.slice(EIP1167_PREFIX.length, EIP1167_PREFIX.length + 40);
}

export function classifyProxy(e: ProxyEvidence): ProxyInfo {
  const implementation = slotToAddress(e.implementationSlot);
  const admin = slotToAddress(e.adminSlot);
  const beacon = slotToAddress(e.beaconSlot);

  if (beacon) {
    return {
      type: "eip1967-beacon",
      isUpgradeable: true,
      implementation: slotToAddress(e.beaconImplementation) ?? implementation,
      admin,
      beacon,
    };
  }
  if (implementation) {
    const isUups =
      (e.implementationProxiableUUID ?? "").toLowerCase() === EIP1967_IMPLEMENTATION_SLOT;
    return {
      type: isUups ? "eip1967-uups" : admin ? "eip1967-transparent" : "eip1967",
      isUpgradeable: true,
      implementation,
      admin,
      beacon: null,
    };
  }
  if ((e.diamondFacetCount ?? 0) > 0) {
    return { type: "eip2535-diamond", isUpgradeable: true, implementation: null, admin, beacon: null };
  }
  const cloneOf = parseEip1167(e.code);
  if (cloneOf) {
    return { type: "eip1167-clone", isUpgradeable: false, implementation: cloneOf, admin: null, beacon: null };
  }
  return { type: "none-detected", isUpgradeable: false, implementation: null, admin, beacon: null };
}
