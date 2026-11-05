// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// M4 measured take: swap a small amount through REAL hooked pools on a local mainnet fork, in both
// directions, and trace every token movement. Read-only with respect to the hook: it only swaps,
// it never impersonates anyone or changes any hook. Nothing is broadcast.
//
// The pool list comes from a selection file the TS runner writes (runner/measure.ts), one pool per
// line:
//   poolId|currency0|currency1|fee|tickSpacing|hooks|amount0In|amount1In
// For each pool it measures zeroForOne (amount0In of token0) and !zeroForOne (amount1In of token1),
// and appends SWAP/FLOW lines to data/cache/sim/measure.txt. Failures are statuses, never reverts.

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TakeMeter} from "./utils/TakeMeter.sol";

contract MeasureReal is TakeMeter {
    using PoolIdLibrary for PoolKey;

    string constant OUT = "../../data/cache/sim/measure.txt";

    struct Row {
        bytes32 poolId;
        PoolKey key;
        uint256 amount0In;
        uint256 amount1In;
    }

    function test_measureReal() public {
        string memory sel = vm.envString("HOOKTAX_SELECTION");
        vm.createSelectFork(vm.envString("MAINNET_FORK_RPC"), vm.envUint("FORK_BLOCK"));
        _deployRouter();
        vm.writeFile(OUT, "");

        Row[] memory rows = _read(sel);
        for (uint256 i; i < rows.length; i++) {
            Row memory r = rows[i];
            // Each measurement is isolated: a revert in one pool must not abort the rest. The swap
            // itself is already wrapped in try/catch inside measureSwap; this guards the tracing too.
            try this.measureOne(r.key, true, r.amount0In, address(0)) returns (Measurement memory m) {
                _writeMeasurement(OUT, r.poolId, "today", m);
            } catch {
                _writeError(r.poolId, true);
            }
            try this.measureOne(r.key, false, r.amount1In, address(0)) returns (Measurement memory m) {
                _writeMeasurement(OUT, r.poolId, "today", m);
            } catch {
                _writeError(r.poolId, false);
            }
        }
    }

    /// External wrapper so a trace-level revert is caught per direction.
    function measureOne(PoolKey memory key, bool zeroForOne, uint256 amountIn, address hookOwner)
        external
        returns (Measurement memory)
    {
        require(msg.sender == address(this), "self only");
        return measureSwap(key, zeroForOne, amountIn, hookOwner);
    }

    function _writeError(bytes32 poolId, bool zeroForOne) private {
        vm.writeLine(
            OUT,
            string.concat(
                "SWAP|", vm.toString(poolId), "|today|", zeroForOne ? "true" : "false",
                "|swap-failed|0x|0x|0|0|0|0|0|0x|0x|0x"
            )
        );
    }

    function _read(string memory file) private view returns (Row[] memory rows) {
        // Count lines, then parse. forge-std vm.readLine returns "" past EOF.
        uint256 n;
        while (bytes(vm.readLine(file)).length != 0) n++;
        vm.closeFile(file);
        rows = new Row[](n);
        for (uint256 i; i < n; i++) {
            string[] memory p = _split(vm.readLine(file));
            rows[i] = Row({
                poolId: vm.parseBytes32(p[0]),
                key: PoolKey({
                    currency0: Currency.wrap(vm.parseAddress(p[1])),
                    currency1: Currency.wrap(vm.parseAddress(p[2])),
                    fee: uint24(vm.parseUint(p[3])),
                    tickSpacing: int24(vm.parseInt(p[4])),
                    hooks: IHooks(vm.parseAddress(p[5]))
                }),
                amount0In: vm.parseUint(p[6]),
                amount1In: vm.parseUint(p[7])
            });
        }
        vm.closeFile(file);
    }

    function _split(string memory line) private pure returns (string[] memory out) {
        bytes memory b = bytes(line);
        uint256 count = 1;
        for (uint256 i; i < b.length; i++) if (b[i] == "|") count++;
        out = new string[](count);
        uint256 idx;
        uint256 start;
        for (uint256 i; i <= b.length; i++) {
            if (i == b.length || b[i] == "|") {
                bytes memory seg = new bytes(i - start);
                for (uint256 j; j < seg.length; j++) seg[j] = b[start + j];
                out[idx++] = string(seg);
                start = i + 1;
            }
        }
    }
}
