// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// TakeMeter: measures what a single swap through a v4 pool sends to the hook, the hook owner or
// anyone other than the swapper and the PoolManager. Runs only inside forge tests on a fork.
//
// Method (docs/measurement.md):
//   1. fund a fresh swapper with exactly `amountIn` of the input currency (deal / vm.deal)
//   2. record every ERC-20 Transfer, every ERC-6909 Transfer emitted by the PoolManager, and every
//      native-ETH value transfer (state diff) during one exact-input swap via PoolSwapTest
//   3. net the flows per (address, token)
//   4. value each third party's net flows in INPUT-token units at the pool's pre-swap mid price;
//      take = sum of positive net values of hook + hook owner + other addresses
//   5. takeBps = take / amountIn; the LP fee comes from the PoolManager's Swap event (`fee`)
// Normal LP fees stay inside the PoolManager, so they are never part of the take.

import {Test, Vm} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

abstract contract TakeMeter is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    IPoolManager internal constant MANAGER = IPoolManager(0x000000000004444c5dc75cB358380D2e3dE08A90);
    bytes32 internal constant ERC20_TRANSFER = keccak256("Transfer(address,address,uint256)");
    bytes32 internal constant ERC6909_TRANSFER = keccak256("Transfer(address,address,address,uint256,uint256)");
    bytes32 internal constant SWAP_EVENT = keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

    uint8 internal constant KIND_ERC20 = 0;
    uint8 internal constant KIND_NATIVE = 1;
    uint8 internal constant KIND_ERC6909 = 2;

    uint8 internal constant ST_OK = 0;
    uint8 internal constant ST_HOOK_REVERTED = 1;
    uint8 internal constant ST_NO_LIQUIDITY = 2;
    uint8 internal constant ST_UNSUPPORTED_TOKEN = 3;
    uint8 internal constant ST_SWAP_FAILED = 4;

    uint256 private constant MAX_FLOWS = 64;
    uint256 private constant Q96 = 2 ** 96;

    PoolSwapTest internal swapRouter;
    uint256 private swapperNonce;

    struct Flow {
        address account;
        address token;
        uint8 kind;
        int256 amount;
    }

    struct Measurement {
        uint8 status;
        bytes revertData;
        bool zeroForOne;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 takeValueIn; // in input-token raw units
        uint256 takeBpsX100; // take in basis points x 100 (0.01 bps resolution)
        uint24 lpFeePips; // from the Swap event; 0 if no swap happened
        address swapper;
        Flow[] flows;
    }

    function _deployRouter() internal {
        swapRouter = new PoolSwapTest(MANAGER);
        // Foundry deploys at deterministic addresses that can hold stray ETH on mainnet; the router
        // refunds its balance to callers, so start it at zero.
        vm.deal(address(swapRouter), 0);
    }

    /// Routers refund leftover ETH to their caller.
    receive() external payable {}

    /// External so a failing `deal` (non-standard token) can be caught as "unsupported-token".
    function fundExternal(address token, address to, uint256 amount) external {
        require(msg.sender == address(this), "self only");
        if (token == address(0)) vm.deal(to, amount);
        else deal(token, to, amount);
    }

    function _balanceOf(address token, address who) internal view returns (uint256) {
        if (token == address(0)) return who.balance;
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        return ok && ret.length >= 32 ? abi.decode(ret, (uint256)) : 0;
    }

    /// One exact-input swap of `amountIn`, fully traced. Never reverts: failures are statuses.
    function measureSwap(PoolKey memory key, bool zeroForOne, uint256 amountIn, address hookOwner)
        internal
        returns (Measurement memory m)
    {
        m.zeroForOne = zeroForOne;
        m.tokenIn = Currency.unwrap(zeroForOne ? key.currency0 : key.currency1);
        m.tokenOut = Currency.unwrap(zeroForOne ? key.currency1 : key.currency0);
        m.swapper = address(uint160(uint256(keccak256(abi.encode("hooktax.swapper", ++swapperNonce)))));

        PoolId id = key.toId();
        (uint160 sqrtPriceX96,,,) = MANAGER.getSlot0(id);
        if (sqrtPriceX96 == 0 || MANAGER.getLiquidity(id) == 0) {
            m.status = ST_NO_LIQUIDITY;
            return m;
        }

        // 1. fund + approve
        try this.fundExternal(m.tokenIn, m.swapper, amountIn) {}
        catch {
            m.status = ST_UNSUPPORTED_TOKEN;
            return m;
        }
        if (_balanceOf(m.tokenIn, m.swapper) < amountIn) {
            m.status = ST_UNSUPPORTED_TOKEN;
            return m;
        }
        if (m.tokenIn != address(0)) {
            vm.prank(m.swapper);
            // Low-level: some tokens (USDT) do not return a bool from approve.
            (bool ok,) = m.tokenIn.call(abi.encodeWithSelector(0x095ea7b3, address(swapRouter), type(uint256).max));
            if (!ok) {
                m.status = ST_UNSUPPORTED_TOKEN;
                return m;
            }
        }

        // 2. swap with full tracing
        vm.recordLogs();
        vm.startStateDiffRecording();
        vm.prank(m.swapper);
        try swapRouter.swap{value: m.tokenIn == address(0) ? amountIn : 0}(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        ) {
            m.status = ST_OK;
        } catch (bytes memory reason) {
            m.revertData = reason;
            m.status = _isHookRevert(reason, address(key.hooks)) ? ST_HOOK_REVERTED : ST_SWAP_FAILED;
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();
        VmSafe.AccountAccess[] memory accesses = vm.stopAndReturnStateDiff();
        if (m.status != ST_OK) return m;

        // 3. net flows
        Flow[] memory acc = new Flow[](MAX_FLOWS);
        uint256 n;
        for (uint256 i; i < logs.length; i++) {
            Vm.Log memory l = logs[i];
            if (l.topics.length == 3 && l.topics[0] == ERC20_TRANSFER && l.data.length == 32) {
                uint256 value = abi.decode(l.data, (uint256));
                n = _add(acc, n, address(uint160(uint256(l.topics[1]))), l.emitter, KIND_ERC20, -int256(value));
                n = _add(acc, n, address(uint160(uint256(l.topics[2]))), l.emitter, KIND_ERC20, int256(value));
            } else if (l.emitter == address(MANAGER) && l.topics.length == 4 && l.topics[0] == ERC6909_TRANSFER) {
                (, uint256 amount) = abi.decode(l.data, (address, uint256));
                address token = address(uint160(uint256(l.topics[3])));
                n = _add(acc, n, address(uint160(uint256(l.topics[1]))), token, KIND_ERC6909, -int256(amount));
                n = _add(acc, n, address(uint160(uint256(l.topics[2]))), token, KIND_ERC6909, int256(amount));
            } else if (l.emitter == address(MANAGER) && l.topics.length == 3 && l.topics[0] == SWAP_EVENT) {
                if (l.topics[1] == PoolId.unwrap(id)) {
                    (,,,,, uint24 fee) = abi.decode(l.data, (int128, int128, uint160, uint128, int24, uint24));
                    m.lpFeePips = fee;
                }
            }
        }
        for (uint256 i; i < accesses.length; i++) {
            VmSafe.AccountAccess memory a = accesses[i];
            if (a.value == 0 || a.reverted) continue;
            if (a.kind != VmSafe.AccountAccessKind.Call && a.kind != VmSafe.AccountAccessKind.Create) continue;
            n = _add(acc, n, a.accessor, address(0), KIND_NATIVE, -int256(a.value));
            n = _add(acc, n, a.account, address(0), KIND_NATIVE, int256(a.value));
        }
        m.flows = new Flow[](n);
        for (uint256 i; i < n; i++) m.flows[i] = acc[i];

        // 4. attribute
        _attribute(m, address(key.hooks), hookOwner, sqrtPriceX96);
    }

    function _attribute(Measurement memory m, address hook, address hookOwner, uint160 sqrtPriceX96) private view {
        int256 swapperIn;
        int256 swapperOut;
        address[] memory parties = new address[](m.flows.length);
        int256[] memory netIn = new int256[](m.flows.length);
        int256[] memory netOut = new int256[](m.flows.length);
        uint256 np;
        for (uint256 i; i < m.flows.length; i++) {
            Flow memory f = m.flows[i];
            if (f.account == address(0)) continue; // mint/burn
            bool isIn = f.token == m.tokenIn;
            bool isOut = f.token == m.tokenOut;
            if (!isIn && !isOut) continue; // third tokens are reported in flows, not valued
            if (_isSwapperSide(f.account, m.swapper)) {
                if (isIn) swapperIn += f.amount;
                else swapperOut += f.amount;
                continue;
            }
            if (f.account == address(MANAGER)) continue; // pool reserves and LP fees
            uint256 j;
            for (; j < np; j++) if (parties[j] == f.account) break;
            if (j == np) parties[np++] = f.account;
            if (isIn) netIn[j] += f.amount;
            else netOut[j] += f.amount;
        }
        m.amountIn = swapperIn < 0 ? uint256(-swapperIn) : 0;
        m.amountOut = swapperOut > 0 ? uint256(swapperOut) : 0;
        uint256 take;
        for (uint256 j; j < np; j++) {
            int256 v = netIn[j] + _outToIn(netOut[j], m.zeroForOne, sqrtPriceX96);
            if (v > 0) take += uint256(v);
        }
        hook;
        hookOwner;
        m.takeValueIn = take;
        m.takeBpsX100 = m.amountIn == 0 ? 0 : FullMath.mulDiv(take, 1_000_000, m.amountIn);
    }

    /// Value an output-token amount in input-token units at the pre-swap mid price.
    function _outToIn(int256 amountOut, bool zeroForOne, uint160 sqrtPriceX96) private pure returns (int256) {
        if (amountOut == 0) return 0;
        uint256 abs = amountOut < 0 ? uint256(-amountOut) : uint256(amountOut);
        // price p = token1 per token0 = (sqrtP / 2^96)^2
        uint256 v = zeroForOne
            ? FullMath.mulDiv(FullMath.mulDiv(abs, Q96, sqrtPriceX96), Q96, sqrtPriceX96) // token1 -> token0: / p
            : FullMath.mulDiv(FullMath.mulDiv(abs, sqrtPriceX96, Q96), sqrtPriceX96, Q96); // token0 -> token1: * p
        return amountOut < 0 ? -int256(v) : int256(v);
    }

    function _isSwapperSide(address a, address swapper) private view returns (bool) {
        return a == swapper || a == address(swapRouter) || a == address(this);
    }

    function _isHookRevert(bytes memory reason, address hook) private pure returns (bool) {
        if (reason.length < 4 + 32) return false;
        bytes4 sel;
        assembly {
            sel := mload(add(reason, 32))
        }
        if (sel != CustomRevert.WrappedError.selector) return false;
        address target;
        assembly {
            target := mload(add(reason, 36))
        }
        return target == hook;
    }

    function _add(Flow[] memory acc, uint256 n, address account, address token, uint8 kind, int256 amount)
        private
        pure
        returns (uint256)
    {
        for (uint256 i; i < n; i++) {
            if (acc[i].account == account && acc[i].token == token && acc[i].kind == kind) {
                acc[i].amount += amount;
                return n;
            }
        }
        require(n < acc.length, "too many flows");
        acc[n] = Flow(account, token, kind, amount);
        return n + 1;
    }

    // ---------------------------------------------------------------- output (one line per record)

    function _statusName(uint8 s) internal pure returns (string memory) {
        if (s == ST_OK) return "ok";
        if (s == ST_HOOK_REVERTED) return "hook-reverted";
        if (s == ST_NO_LIQUIDITY) return "no-liquidity";
        if (s == ST_UNSUPPORTED_TOKEN) return "unsupported-token";
        return "swap-failed";
    }

    /// SWAP|poolId|scenario|zeroForOne|status|tokenIn|tokenOut|amountIn|amountOut|takeValueIn|takeBpsX100|lpFeePips|swapper|router|revertData
    /// FLOW|poolId|scenario|zeroForOne|account|token|kind|amount
    function _writeMeasurement(string memory file, bytes32 poolId, string memory scenario, Measurement memory m)
        internal
    {
        string memory head = string.concat(vm.toString(poolId), "|", scenario, "|", m.zeroForOne ? "true" : "false");
        vm.writeLine(
            file,
            string.concat(
                "SWAP|",
                head,
                "|",
                _statusName(m.status),
                "|",
                vm.toString(m.tokenIn),
                "|",
                vm.toString(m.tokenOut),
                "|",
                vm.toString(m.amountIn),
                "|",
                vm.toString(m.amountOut),
                "|",
                vm.toString(m.takeValueIn),
                "|",
                vm.toString(m.takeBpsX100),
                "|",
                vm.toString(uint256(m.lpFeePips)),
                "|",
                string.concat(vm.toString(m.swapper), "|", vm.toString(address(swapRouter)), "|", vm.toString(m.revertData))
            )
        );
        for (uint256 i; i < m.flows.length; i++) {
            Flow memory f = m.flows[i];
            if (f.amount == 0) continue;
            vm.writeLine(
                file,
                string.concat(
                    "FLOW|",
                    head,
                    "|",
                    vm.toString(f.account),
                    "|",
                    vm.toString(f.token),
                    "|",
                    vm.toString(uint256(f.kind)),
                    "|",
                    vm.toString(f.amount)
                )
            );
        }
    }
}
