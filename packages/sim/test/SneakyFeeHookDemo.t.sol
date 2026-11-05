// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// M5 worst-case demo, run by `make demo`. LOCAL FORK ONLY: nothing here is broadcast.
//   1. deploy SneakyFeeHook v1 behind an ERC1967Proxy whose address is mined to 0x...88
//      (BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA)
//   2. HookTax preflight: from address bits + proxy slot alone, the worst case is 100% of swap value
//   3. create a USDC/WETH pool (mainnet tokens, price from the live ETH/USDC v4 pool), add liquidity
//   4. measure: 0.30% take in both directions
//   5. impersonate the owner, upgrade to v2, measure again: 100% take

import {console2} from "forge-std/console2.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";
import {ERC1967Proxy} from "openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SneakyFeeHookBase, SneakyFeeHookV1, SneakyFeeHookV2} from "../src/SneakyFeeHook.sol";
import {TakeMeter} from "./utils/TakeMeter.sol";

contract SneakyFeeHookDemo is TakeMeter {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for *;

    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    /// The first v4 pool on mainnet: ETH/USDC 0.05% (no hook). Used only to read the ETH price.
    bytes32 constant ETH_USDC_POOL = 0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27;
    bytes32 constant IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    string constant OUT = "../../data/cache/sim/demo.txt";

    function test_sneakyFeeHook_todayVsWorstCase() public {
        vm.createSelectFork(vm.envString("MAINNET_FORK_RPC"), vm.envUint("FORK_BLOCK"));
        _deployRouter();
        PoolModifyLiquidityTest lpRouter = new PoolModifyLiquidityTest(MANAGER);
        vm.deal(address(lpRouter), 0);
        address admin = makeAddr("sneaky-admin");

        // 1. v1 behind a mined proxy
        SneakyFeeHookV1 v1 = new SneakyFeeHookV1(MANAGER);
        bytes memory initData = abi.encodeCall(SneakyFeeHookBase.initialize, (admin, admin));
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        (address mined, bytes32 salt) =
            HookMiner.find(address(this), flags, type(ERC1967Proxy).creationCode, abi.encode(address(v1), initData));
        address hook = address(new ERC1967Proxy{salt: salt}(address(v1), initData));
        assertEq(hook, mined, "mined address");

        // 2. HookTax preflight: facts only, before any upgrade
        uint256 bits = uint160(hook) & Hooks.ALL_HOOK_MASK;
        address impl = address(uint160(uint256(vm.load(hook, IMPL_SLOT))));
        bytes32 uuid = SneakyFeeHookBase(impl).proxiableUUID();
        assertEq(bits, 0x88, "permission bits");
        assertEq(impl, address(v1), "EIP-1967 implementation slot");
        assertEq(uuid, IMPL_SLOT, "UUPS");
        console2.log("HookTax preflight (before any upgrade):");
        console2.log("  hook", hook);
        console2.log("  permission bits 0x88 = BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA");
        console2.log("  EIP-1967 implementation slot set, implementation is UUPS -> upgradeable");
        console2.log("  worst case from facts: up to 100% of swap value");

        vm.writeFile(OUT, "");
        vm.writeLine(
            OUT,
            string.concat(
                "HOOK|", vm.toString(hook), "|", vm.toString(bits), "|", vm.toString(impl), "|", vm.toString(uuid), "|",
                vm.toString(admin), "|", vm.toString(block.number)
            )
        );

        // 3. pool at the live ETH price, with liquidity
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(WETH),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(hook)
        });
        (uint160 ethUsdcSqrt,,,) = MANAGER.getSlot0(PoolId.wrap(ETH_USDC_POOL));
        // ETH/USDC pool: token0 = ETH, token1 = USDC. Ours: token0 = USDC, token1 = WETH -> invert.
        uint160 sqrtPriceX96 = uint160(FullMath.mulDiv(1 << 96, 1 << 96, ethUsdcSqrt));
        MANAGER.initialize(key, sqrtPriceX96);
        deal(USDC, address(this), 50_000_000e6);
        deal(WETH, address(this), 50_000e18);
        (bool ok,) = USDC.call(abi.encodeWithSelector(0x095ea7b3, address(lpRouter), type(uint256).max));
        require(ok);
        (ok,) = WETH.call(abi.encodeWithSelector(0x095ea7b3, address(lpRouter), type(uint256).max));
        require(ok);
        lpRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: TickMath.minUsableTick(60),
                tickUpper: TickMath.maxUsableTick(60),
                liquidityDelta: 1e16,
                salt: 0
            }),
            ""
        );
        bytes32 poolId = PoolId.unwrap(key.toId());
        vm.writeLine(OUT, string.concat("POOL|", vm.toString(poolId), "|", vm.toString(uint256(sqrtPriceX96))));

        // $1,000 each way: 1,000 USDC, and the same value of WETH at the pool price.
        uint256 usdcIn = 1_000e6;
        uint256 wethIn = FullMath.mulDiv(FullMath.mulDiv(usdcIn, sqrtPriceX96, 1 << 96), sqrtPriceX96, 1 << 96);

        // 4. today (v1)
        Measurement memory a = measureSwap(key, true, usdcIn, admin);
        Measurement memory b = measureSwap(key, false, wethIn, admin);
        _writeMeasurement(OUT, poolId, "today", a);
        _writeMeasurement(OUT, poolId, "today", b);
        assertEq(a.status, ST_OK, "v1 USDC->WETH");
        assertEq(b.status, ST_OK, "v1 WETH->USDC");
        // +-1 = 0.01 bps: the hook floors its fee to whole wei.
        assertApproxEqAbs(a.takeBpsX100, 3000, 1, "v1 takes 0.30% (USDC->WETH)");
        assertApproxEqAbs(b.takeBpsX100, 3000, 1, "v1 takes 0.30% (WETH->USDC)");
        console2.log("today (v1): measured take USDC->WETH (bps x100)", a.takeBpsX100);
        console2.log("today (v1): measured take WETH->USDC (bps x100)", b.takeBpsX100);

        // 5. the owner replaces the code behind the same address
        SneakyFeeHookV2 v2 = new SneakyFeeHookV2(MANAGER);
        vm.prank(admin);
        SneakyFeeHookBase(hook).upgradeToAndCall(address(v2), "");
        assertEq(address(uint160(uint256(vm.load(hook, IMPL_SLOT)))), address(v2), "upgraded");
        assertEq(uint160(hook) & Hooks.ALL_HOOK_MASK, 0x88, "permissions unchanged: same address");
        vm.writeLine(OUT, string.concat("UPGRADE|", vm.toString(address(v1)), "|", vm.toString(address(v2))));

        Measurement memory c = measureSwap(key, true, usdcIn, admin);
        Measurement memory d = measureSwap(key, false, wethIn, admin);
        _writeMeasurement(OUT, poolId, "after-admin-upgrade", c);
        _writeMeasurement(OUT, poolId, "after-admin-upgrade", d);
        assertEq(c.status, ST_OK, "v2 USDC->WETH");
        assertEq(d.status, ST_OK, "v2 WETH->USDC");
        assertEq(c.takeBpsX100, 1_000_000, "v2 takes 100% (USDC->WETH)");
        assertEq(d.takeBpsX100, 1_000_000, "v2 takes 100% (WETH->USDC)");
        assertEq(c.amountOut, 0, "swapper receives nothing");
        console2.log("after admin upgrade (v2): measured take USDC->WETH (bps x100)", c.takeBpsX100);
        console2.log("after admin upgrade (v2): measured take WETH->USDC (bps x100)", d.takeBpsX100);
    }
}
