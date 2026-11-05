// Hook permission bits: the lowest 14 bits of the hook address (v4-core `Hooks.sol`, tag v4.0.0).
// They are fixed at deployment, because a contract's address cannot change. An upgradeable hook can
// change its code, but never its permissions.

export const HOOK_FLAGS = [
  { name: "beforeInitialize", bit: 13, constant: "BEFORE_INITIALIZE_FLAG" },
  { name: "afterInitialize", bit: 12, constant: "AFTER_INITIALIZE_FLAG" },
  { name: "beforeAddLiquidity", bit: 11, constant: "BEFORE_ADD_LIQUIDITY_FLAG" },
  { name: "afterAddLiquidity", bit: 10, constant: "AFTER_ADD_LIQUIDITY_FLAG" },
  { name: "beforeRemoveLiquidity", bit: 9, constant: "BEFORE_REMOVE_LIQUIDITY_FLAG" },
  { name: "afterRemoveLiquidity", bit: 8, constant: "AFTER_REMOVE_LIQUIDITY_FLAG" },
  { name: "beforeSwap", bit: 7, constant: "BEFORE_SWAP_FLAG" },
  { name: "afterSwap", bit: 6, constant: "AFTER_SWAP_FLAG" },
  { name: "beforeDonate", bit: 5, constant: "BEFORE_DONATE_FLAG" },
  { name: "afterDonate", bit: 4, constant: "AFTER_DONATE_FLAG" },
  { name: "beforeSwapReturnsDelta", bit: 3, constant: "BEFORE_SWAP_RETURNS_DELTA_FLAG" },
  { name: "afterSwapReturnsDelta", bit: 2, constant: "AFTER_SWAP_RETURNS_DELTA_FLAG" },
  { name: "afterAddLiquidityReturnsDelta", bit: 1, constant: "AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG" },
  {
    name: "afterRemoveLiquidityReturnsDelta",
    bit: 0,
    constant: "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG",
  },
] as const;

export type HookFlagName = (typeof HOOK_FLAGS)[number]["name"];
export type HookPermissions = Record<HookFlagName, boolean>;

/** Mask covering all 14 permission bits (`Hooks.ALL_HOOK_MASK` in v4-core). */
export const ALL_HOOK_FLAGS_MASK = (1 << 14) - 1; // 0x3fff

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The low 14 bits of a hook address, as a number in [0, 0x3fff]. */
export function permissionBits(hookAddress: string): number {
  if (!ADDRESS_RE.test(hookAddress)) {
    throw new Error(`not a 20-byte hex address: ${hookAddress}`);
  }
  return Number(BigInt(hookAddress) & BigInt(ALL_HOOK_FLAGS_MASK));
}

/** Decode a bitmask (or an address) into one boolean per permission. */
export function decodePermissions(bitsOrAddress: number | string): HookPermissions {
  const bits = typeof bitsOrAddress === "string" ? permissionBits(bitsOrAddress) : bitsOrAddress;
  if (!Number.isInteger(bits) || bits < 0 || bits > ALL_HOOK_FLAGS_MASK) {
    throw new Error(`permission bits out of range: ${bits}`);
  }
  const out = {} as HookPermissions;
  for (const flag of HOOK_FLAGS) out[flag.name] = (bits & (1 << flag.bit)) !== 0;
  return out;
}

/** Names of the set permissions, in v4-core order (bit 13 first). */
export function permissionNames(perms: HookPermissions): HookFlagName[] {
  return HOOK_FLAGS.filter((f) => perms[f.name]).map((f) => f.name);
}

/** Re-encode permissions into the 14-bit mask (inverse of decodePermissions). */
export function encodePermissions(perms: HookPermissions): number {
  let bits = 0;
  for (const flag of HOOK_FLAGS) if (perms[flag.name]) bits |= 1 << flag.bit;
  return bits;
}

export function hasSwapDeltaPermission(perms: HookPermissions): boolean {
  return perms.beforeSwapReturnsDelta || perms.afterSwapReturnsDelta;
}

export function hasLiquidityDeltaPermission(perms: HookPermissions): boolean {
  return perms.afterAddLiquidityReturnsDelta || perms.afterRemoveLiquidityReturnsDelta;
}

/** Short human label for a permission name, e.g. "beforeSwapReturnsDelta" -> "BEFORE_SWAP_RETURNS_DELTA". */
export function permissionLabel(name: HookFlagName): string {
  const f = HOOK_FLAGS.find((x) => x.name === name);
  return f ? f.constant.replace(/_FLAG$/, "") : name;
}
