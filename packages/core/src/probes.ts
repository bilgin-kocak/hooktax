// Real-hook upgrade probes (packages/sim test/ProbeUpgrade.t.sol): plain-English outcomes, shared
// by the sim runner (SimResult notes), the CLI and the web card.

import type { ProbeAttempt } from "./types";

/** Revert selectors seen from upgrade paths, decoded for the "not demonstrated" note. */
export const KNOWN_REVERTS: Record<string, string> = {
  "0x118cdaa7": "OwnableUnauthorizedAccount",
  "0x0e5daa94": "UpgradesDisabled",
  "0x82b42900": "Unauthorized",
  "0xe2517d3f": "AccessControlUnauthorizedAccount",
  "0xe07c8dba": "UUPSUnauthorizedCallContext",
  "0xaa1d49a4": "UUPSUnsupportedProxiableUUID",
  "0x4c9c8ce3": "ERC1967InvalidImplementation",
  "0xd2b576ec": "ProxyDeniedAdminAccess",
};

/** Plain-English reason one probe attempt did not execute. */
export function probeOutcome(p: ProbeAttempt): string {
  if (p.method === "ProxyAdmin.owner-renounced") return "the ProxyAdmin's ownership is renounced (owner() is the zero address), so no one can upgrade";
  if (p.method === "no-upgrade-authority-found") return "no upgrade authority found (no admin slot, owner() or role admin)";
  const sel = p.revertData?.slice(0, 10).toLowerCase();
  const why = sel ? (KNOWN_REVERTS[sel] ?? `reverted ${sel}`) : "reverted without data or did not change the implementation";
  return `${p.method} as ${p.caller}: ${sel && KNOWN_REVERTS[sel] ? `reverted ${why}` : why}`;
}

/** Short form for the card: "ProxyAdmin.upgradeAndCall: OwnableUnauthorizedAccount". */
export function probeShort(p: ProbeAttempt): string {
  if (p.method === "ProxyAdmin.owner-renounced") return "ProxyAdmin ownership renounced";
  if (p.method === "no-upgrade-authority-found") return "no upgrade authority found";
  const sel = p.revertData?.slice(0, 10).toLowerCase();
  return sel ? `${p.method}: ${KNOWN_REVERTS[sel] ?? sel}` : p.method;
}
