// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// FORK-ONLY PROBE. When a REAL mainnet hook is an upgradeable proxy, HookTax impersonates its
// upgrade authority on a local fork and points the proxy at this implementation, then swaps again.
// If the upgrade executes, the measured take shows what the authority could do with today's
// permission bits. Nothing here touches mainnet.
//
// Storage-agnostic: only immutables, so it is safe behind any proxy's storage layout. Every hook
// callback returns its selector with zero deltas, except where the PROXY ADDRESS (address(this) in
// delegatecall context) has the matching RETURNS_DELTA bit:
//   BEFORE_SWAP_RETURNS_DELTA: take 100% of the swap's specified amount
//   AFTER_SWAP_RETURNS_DELTA:  take 100% of the unspecified amount the swapper would receive
// Taking without the matching delta permission would leave the hook in debt and revert, so the
// bits are checked first.
//
// The take is MINTED as PoolManager ERC-6909 claims to `recipient` rather than transferred out as
// tokens: the PoolManager accounting is the same (the hook is debited), but no token code runs, so
// a token that restricts transfers (anti-bot, max wallet) cannot make the probe revert.

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

contract TakeAllImplementation {
    using CurrencyLibrary for Currency;

    bytes32 private constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    IPoolManager public immutable poolManager;
    address public immutable recipient;

    constructor(IPoolManager _poolManager, address _recipient) {
        poolManager = _poolManager;
        recipient = _recipient;
    }

    /// UUPS: the current implementation checks this before upgrading to us.
    function proxiableUUID() external pure returns (bytes32) {
        return IMPL_SLOT;
    }

    function _has(uint160 flag) private view returns (bool) {
        return uint160(address(this)) & flag != 0;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        require(msg.sender == address(poolManager), "pm only");
        if (!_has(Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG)) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
        bool exactInput = params.amountSpecified < 0;
        uint256 amount = exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        Currency specified = (params.zeroForOne == exactInput) ? key.currency0 : key.currency1;
        poolManager.mint(recipient, specified.toId(), amount);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(amount)), 0), 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        returns (bytes4, int128)
    {
        require(msg.sender == address(poolManager), "pm only");
        if (!_has(Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG)) return (IHooks.afterSwap.selector, 0);
        bool exactInput = params.amountSpecified < 0;
        // The unspecified currency is the output for exact-input swaps.
        bool unspecifiedIs0 = (params.zeroForOne != exactInput);
        int128 swapperUnspecified = unspecifiedIs0 ? delta.amount0() : delta.amount1();
        if (swapperUnspecified <= 0) return (IHooks.afterSwap.selector, 0);
        Currency unspecified = unspecifiedIs0 ? key.currency0 : key.currency1;
        poolManager.mint(recipient, unspecified.toId(), uint256(int256(swapperUnspecified)));
        return (IHooks.afterSwap.selector, swapperUnspecified);
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        return (IHooks.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IHooks.afterDonate.selector;
    }
}
