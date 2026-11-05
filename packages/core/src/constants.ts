// Every value here was verified against an official source or onchain; see docs/versions.md.

/** Ethereum mainnet. HookTax only ever READS mainnet; all writes happen on a local fork. */
export const CHAIN_ID = 1;

/** Uniswap v4 PoolManager (official deployments page). */
export const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90" as const;
/** First block with PoolManager code (eth_getCode boundary + first log). */
export const POOL_MANAGER_DEPLOY_BLOCK = 21_688_329;

/** Uniswap v4 StateView (official deployments page): read-only pool state. */
export const STATE_VIEW = "0x7ffe42c4a5deea5b0fec41c94c136cf115597227" as const;

/** Multicall3, same address on every EVM chain. */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** keccak256("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)") */
export const INITIALIZE_TOPIC0 =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438" as const;

/** Event ABI from v4-core v4.0.0 `IPoolManager.sol`. `hooks` is NOT indexed. */
export const INITIALIZE_EVENT_SIGNATURE =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)" as const;

/** LPFeeLibrary.DYNAMIC_FEE_FLAG: pool fee value that marks a dynamic-fee pool. */
export const DYNAMIC_FEE_FLAG = 0x800000;
/** LPFeeLibrary.OVERRIDE_FEE_FLAG: beforeSwap may return a per-swap fee override in dynamic pools. */
export const OVERRIDE_FEE_FLAG = 0x400000;
/** LPFeeLibrary.MAX_LP_FEE: 1_000_000 pips = 100%. */
export const MAX_LP_FEE = 1_000_000;

/** EIP-1967 storage slots: keccak256(label) - 1. */
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;
export const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as const;

/** v4 represents native ETH as currency address(0). */
export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_ADDRESS = NATIVE_CURRENCY;

/** 1 basis point = 0.01%; LP fees are in pips (1e-6). */
export const BPS = 10_000;
