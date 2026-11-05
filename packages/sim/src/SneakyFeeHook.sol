// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// DEMO ONLY. SneakyFeeHook is planted on a LOCAL mainnet fork to prove a worst case HookTax
// computes from onchain facts: an upgradeable hook with BEFORE_SWAP_RETURNS_DELTA can take up to
// 100% of swap value. It is never deployed to a live network.
//
// Shape: UUPS implementation behind an ERC1967Proxy. The proxy address is mined so its low 14 bits
// are BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA (0x88). Permissions are fixed by that address; the
// owner can swap the code behind it at any time.
//   v1: takes 0.3% of the swap's specified amount
//   v2: takes 100%
// Mechanism (standard v4 hook-fee pattern): in beforeSwap the hook `take`s `fee` of the specified
// currency from the PoolManager and returns a +fee specified delta, so the swapper still pays the
// full input while the pool only swaps `input - fee`.

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {UUPSUpgradeable} from "openzeppelin-contracts/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "openzeppelin-contracts/contracts/proxy/utils/Initializable.sol";

abstract contract SneakyFeeHookBase is Initializable, UUPSUpgradeable {
    /// Same PoolManager for every version; immutables live in the implementation's code.
    IPoolManager public immutable poolManager;

    // Storage layout must stay identical across versions.
    address public owner;
    address public feeRecipient;

    error NotPoolManager();
    error NotOwner();

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        _disableInitializers();
    }

    function initialize(address _owner, address _feeRecipient) external initializer {
        owner = _owner;
        feeRecipient = _feeRecipient;
    }

    /// Fee in basis points of the swap's specified amount.
    function feeBps() public pure virtual returns (uint256);

    function version() public pure virtual returns (string memory);

    function _authorizeUpgrade(address) internal view override {
        if (msg.sender != owner) revert NotOwner();
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        bool exactInput = params.amountSpecified < 0;
        uint256 amount = exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        uint256 fee = amount * feeBps() / 10_000;
        if (fee == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        // The specified currency is the input for exact-input swaps and the output for exact-output.
        Currency specified = (params.zeroForOne == exactInput) ? key.currency0 : key.currency1;
        poolManager.take(specified, feeRecipient, fee);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }
}

contract SneakyFeeHookV1 is SneakyFeeHookBase {
    constructor(IPoolManager pm) SneakyFeeHookBase(pm) {}

    function feeBps() public pure override returns (uint256) {
        return 30; // 0.30%
    }

    function version() public pure override returns (string memory) {
        return "v1";
    }
}

contract SneakyFeeHookV2 is SneakyFeeHookBase {
    constructor(IPoolManager pm) SneakyFeeHookBase(pm) {}

    function feeBps() public pure override returns (uint256) {
        return 10_000; // 100%
    }

    function version() public pure override returns (string memory) {
        return "v2";
    }
}
