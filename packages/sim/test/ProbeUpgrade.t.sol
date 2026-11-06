// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// M5 on REAL hooks: for upgradeable mainnet hooks that can change swap amounts, prove (or fail to
// prove) the worst case on a LOCAL mainnet fork. Nothing is broadcast.
//
// For each selected pool (one per hook):
//   1. measure today's take, both directions (same as MeasureReal)
//   2. impersonate each candidate upgrade authority and try the known upgrade paths, pointing the
//      proxy at TakeAllImplementation (storage-agnostic; takes 100% only through the proxy's own
//      RETURNS_DELTA bits)
//   3. if the EIP-1967 implementation slot now holds TakeAllImplementation, measure again
//      ("after-admin-upgrade"); otherwise the worst case stays "not demonstrated"
// Every swap starts from the fork block's pool state (snapshot/revert per direction).
// Every attempt is reported, executed or not. Only what actually executed counts.
//
// Selection file (written by runner/probe.ts), one pool per line:
//   poolId|currency0|currency1|fee|tickSpacing|hook|amount0In|amount1In|upgradeAuthority
// Output lines (data/cache/sim/probe.txt): SWAP/FLOW as in TakeMeter, plus
//   PROBE|poolId|hook|method|caller|executed(true/false)|revertData

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TakeMeter} from "./utils/TakeMeter.sol";
import {TakeAllImplementation} from "../src/TakeAllImplementation.sol";

contract ProbeUpgrade is TakeMeter {
    string constant OUT = "../../data/cache/sim/probe.txt";
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    // OpenZeppelin ProxyAdmin (v4 and v5) and proxy / UUPS upgrade entry points.
    bytes4 constant PROXY_ADMIN_UPGRADE_AND_CALL = bytes4(keccak256("upgradeAndCall(address,address,bytes)"));
    bytes4 constant PROXY_ADMIN_UPGRADE = bytes4(keccak256("upgrade(address,address)"));
    bytes4 constant UPGRADE_TO_AND_CALL = bytes4(keccak256("upgradeToAndCall(address,bytes)"));
    bytes4 constant UPGRADE_TO = bytes4(keccak256("upgradeTo(address)"));

    struct Row {
        bytes32 poolId;
        PoolKey key;
        uint256 amount0In;
        uint256 amount1In;
        address authority;
    }

    address recipient;

    function test_probeUpgrades() public {
        string memory sel = vm.envString("HOOKTAX_SELECTION");
        vm.createSelectFork(vm.envString("MAINNET_FORK_RPC"), vm.envUint("FORK_BLOCK"));
        _deployRouter();
        // A fresh address the replacement code sends the take to (a contract authority may not
        // accept ETH, so the take never goes to the authority itself).
        recipient = makeAddr("hooktax-probe-recipient");
        vm.writeFile(OUT, "");

        Row[] memory rows = _read(sel);
        for (uint256 i; i < rows.length; i++) {
            // Each hook is isolated: its upgrade must not leak into the next measurement.
            uint256 snap = vm.snapshotState();
            try this.probeOne(rows[i]) {} catch {}
            vm.revertToState(snap);
        }
    }

    function probeOne(Row memory r) external {
        require(msg.sender == address(this), "self only");
        address hook = address(r.key.hooks);

        _measureBoth(r, "today");

        TakeAllImplementation takeAll = new TakeAllImplementation(MANAGER, recipient);
        if (_tryUpgrades(r.poolId, hook, address(takeAll), r.authority)) {
            _measureBoth(r, "after-admin-upgrade");
        }
    }

    /// Each direction starts from the same pool state, so "today" and "after-admin-upgrade" differ
    /// only in the hook's code (a swap would otherwise move a thin pool out of its liquidity range).
    function _measureBoth(Row memory r, string memory scenario) private {
        uint256 snap = vm.snapshotState();
        try this.measureOne(r.key, true, r.amount0In) returns (Measurement memory m) {
            _writeMeasurement(OUT, r.poolId, scenario, m);
        } catch {
            _writeError(r.poolId, scenario, true);
        }
        vm.revertToState(snap);
        try this.measureOne(r.key, false, r.amount1In) returns (Measurement memory m) {
            _writeMeasurement(OUT, r.poolId, scenario, m);
        } catch {
            _writeError(r.poolId, scenario, false);
        }
        vm.revertToState(snap);
    }

    function measureOne(PoolKey memory key, bool zeroForOne, uint256 amountIn) external returns (Measurement memory) {
        require(msg.sender == address(this), "self only");
        return measureSwap(key, zeroForOne, amountIn, address(0));
    }

    /// Try each (caller, upgrade path) pair until the implementation slot holds `impl`.
    function _tryUpgrades(bytes32 poolId, address hook, address impl, address dataAuthority) private returns (bool) {
        address adminSlot = address(uint160(uint256(vm.load(hook, ADMIN_SLOT))));
        address adminOwner = adminSlot.code.length > 0 ? _addressCall(adminSlot, abi.encodeWithSignature("owner()")) : address(0);
        address hookOwner = _addressCall(hook, abi.encodeWithSignature("owner()"));
        address roleAdmin = _addressCall(hook, abi.encodeWithSignature("getRoleMember(bytes32,uint256)", bytes32(0), uint256(0)));

        // 1. Transparent proxy behind an OpenZeppelin ProxyAdmin: its owner upgrades. A ProxyAdmin
        //    whose owner() is the zero address has renounced ownership: no one can upgrade.
        if (adminSlot.code.length > 0) {
            (bool ok, bytes memory ret) = adminSlot.staticcall(abi.encodeWithSignature("owner()"));
            if (ok && ret.length >= 32 && abi.decode(ret, (address)) == address(0)) {
                _writeProbe(poolId, hook, "ProxyAdmin.owner-renounced", address(0), false, "");
            }
            address[2] memory owners = [dataAuthority, adminOwner];
            for (uint256 i; i < 2; i++) {
                if (owners[i] == address(0) || (i == 1 && owners[1] == owners[0])) continue;
                bytes memory a = abi.encodeWithSelector(PROXY_ADMIN_UPGRADE_AND_CALL, hook, impl, bytes(""));
                if (_attempt(poolId, hook, impl, adminSlot, owners[i], a, "ProxyAdmin.upgradeAndCall")) return true;
                bytes memory b = abi.encodeWithSelector(PROXY_ADMIN_UPGRADE, hook, impl);
                if (_attempt(poolId, hook, impl, adminSlot, owners[i], b, "ProxyAdmin.upgrade")) return true;
            }
        }
        // 2. Transparent proxy whose admin slot holds the authority itself, or UUPS (owner / role).
        address[4] memory callers = [adminSlot, dataAuthority, hookOwner, roleAdmin];
        for (uint256 i; i < 4; i++) {
            address c = callers[i];
            if (c == address(0) || (i == 0 && c.code.length > 0)) continue; // a ProxyAdmin was tried above
            bool seen;
            for (uint256 j; j < i; j++) if (callers[j] == c) seen = true;
            if (seen) continue;
            bytes memory a = abi.encodeWithSelector(UPGRADE_TO_AND_CALL, impl, bytes(""));
            if (_attempt(poolId, hook, impl, hook, c, a, "proxy.upgradeToAndCall")) return true;
            bytes memory b = abi.encodeWithSelector(UPGRADE_TO, impl);
            if (_attempt(poolId, hook, impl, hook, c, b, "proxy.upgradeTo")) return true;
        }
        if (adminSlot == address(0) && dataAuthority == address(0) && hookOwner == address(0) && roleAdmin == address(0)) {
            _writeProbe(poolId, hook, "no-upgrade-authority-found", address(0), false, "");
        }
        return false;
    }

    function _attempt(
        bytes32 poolId,
        address hook,
        address impl,
        address target,
        address caller,
        bytes memory data,
        string memory method
    ) private returns (bool executed) {
        vm.prank(caller);
        (bool ok, bytes memory ret) = target.call(data);
        executed = ok && address(uint160(uint256(vm.load(hook, IMPL_SLOT)))) == impl;
        _writeProbe(poolId, hook, method, caller, executed, ok ? bytes("") : ret);
    }

    function _addressCall(address target, bytes memory data) private view returns (address a) {
        (bool ok, bytes memory ret) = target.staticcall(data);
        if (ok && ret.length >= 32) a = abi.decode(ret, (address));
    }

    function _writeProbe(bytes32 poolId, address hook, string memory method, address caller, bool executed, bytes memory ret)
        private
    {
        bytes memory r = ret.length > 100 ? _slice(ret, 100) : ret;
        vm.writeLine(
            OUT,
            string.concat(
                "PROBE|", vm.toString(poolId), "|", vm.toString(hook), "|", method, "|", vm.toString(caller), "|",
                executed ? "true" : "false", "|", vm.toString(r)
            )
        );
    }

    function _slice(bytes memory b, uint256 n) private pure returns (bytes memory out) {
        out = new bytes(n);
        for (uint256 i; i < n; i++) out[i] = b[i];
    }

    function _writeError(bytes32 poolId, string memory scenario, bool zeroForOne) private {
        vm.writeLine(
            OUT,
            string.concat(
                "SWAP|", vm.toString(poolId), "|", scenario, "|", zeroForOne ? "true" : "false",
                "|swap-failed|0x|0x|0|0|0|0|0|0x|0x|0x"
            )
        );
    }

    function _read(string memory file) private returns (Row[] memory rows) {
        uint256 n;
        while (bytes(vm.readLine(file)).length != 0) n++;
        vm.closeFile(file);
        rows = new Row[](n);
        for (uint256 i; i < n; i++) {
            string[] memory p = vm.split(vm.readLine(file), "|");
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
                amount1In: vm.parseUint(p[7]),
                authority: vm.parseAddress(p[8])
            });
        }
        vm.closeFile(file);
    }
}
