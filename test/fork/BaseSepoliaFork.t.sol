// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {PredictionHub} from "../../src/PredictionHub.sol";
import {PredictionSpoke} from "../../src/PredictionSpoke.sol";
import {Networks} from "../../script/Networks.sol";

interface IDrip {
    function drip(address) external;
}

/// Runs against live CCIP 2.0 contracts on a Base Sepolia fork.
/// FORK_TESTS=true forge test --match-path test/fork/* -vv
contract BaseSepoliaForkTest is Test {
    Networks.Net base = Networks.baseSepolia();
    uint64 constant ARB = 3478487238524512106;
    PredictionHub hub;
    address spoke = address(0x5907e);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint64 closeT;
    uint32 hubGas;

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) vm.skip(true);
        vm.createSelectFork(vm.envOr("BASE_SEPOLIA_RPC_URL", string("https://sepolia.base.org")));
        hub = new PredictionHub(base.router, base.bnm, base.link);
        hub.setSpoke(ARB, spoke);
        hub.setFeedAllowed(base.ethUsdFeed, true);
        closeT = uint64(block.timestamp + 1 hours);
        hub.createMarket(base.ethUsdFeed, 2000e8, closeT, "q");
        hubGas = new PredictionSpoke(base.router, base.bnm, base.selector, address(hub)).HUB_GAS_LIMIT();
        deal(base.link, address(hub), 10 ether);
    }

    function _msg(PredictionHub.Action a, address user, bool yes, uint256 amt)
        internal
        view
        returns (Client.Any2EVMMessage memory m)
    {
        Client.EVMTokenAmount[] memory t = new Client.EVMTokenAmount[](amt > 0 ? 1 : 0);
        if (amt > 0) t[0] = Client.EVMTokenAmount(base.bnm, amt);
        m = Client.Any2EVMMessage(
            keccak256(abi.encode(a, user, amt)), ARB, abi.encode(spoke), abi.encode(a, uint256(0), user, yes), t
        );
    }

    /// Delivers like Router.routeMessage: exactly `hubGas` forwarded to ccipReceive.
    function _deliver(Client.Any2EVMMessage memory m) internal returns (bool ok, uint256 used) {
        vm.prank(base.router);
        uint256 g = gasleft();
        (ok,) = address(hub).call{gas: hubGas}(abi.encodeCall(hub.ccipReceive, (m)));
        used = g - gasleft();
    }

    function test_fork_crossChainClaimFitsGasLimit() public {
        IDrip(base.bnm).drip(address(hub)); // what the token pool would mint on delivery
        (bool ok, uint256 used) = _deliver(_msg(PredictionHub.Action.Bet, alice, true, 1e18));
        assertTrue(ok, "bet");
        console2.log("bet receive gas", used);

        IDrip(base.bnm).drip(bob);
        vm.startPrank(bob);
        IERC20(base.bnm).approve(address(hub), 1e18);
        hub.bet(0, false, 1e18);
        vm.stopPrank();

        // Resolve against a synthetic "first round after close" on the real feed address.
        vm.warp(closeT + 1);
        vm.mockCall(
            base.ethUsdFeed,
            abi.encodeWithSelector(AggregatorV3Interface.getRoundData.selector, uint80(5)),
            abi.encode(uint80(5), int256(2500e8), closeT + 1, closeT + 1, uint80(5))
        );
        vm.mockCall(
            base.ethUsdFeed,
            abi.encodeWithSelector(AggregatorV3Interface.getRoundData.selector, uint80(4)),
            abi.encode(uint80(4), int256(2400e8), closeT - 1, closeT - 1, uint80(4))
        );
        hub.resolve(0, 5);
        vm.clearMockedCalls();

        uint256 linkBefore = IERC20(base.link).balanceOf(address(hub));
        (ok, used) = _deliver(_msg(PredictionHub.Action.Claim, alice, false, 0));
        console2.log("claim receive gas", used, "limit", hubGas);
        console2.log("payout LINK fee", linkBefore - IERC20(base.link).balanceOf(address(hub)));
        assertTrue(ok, "claim payout must fit HUB_GAS_LIMIT");
        assertTrue(hub.getPosition(0, alice, ARB).claimed);
    }

    function test_fork_lateBetRefundFitsGasLimit() public {
        vm.warp(closeT);
        IDrip(base.bnm).drip(address(hub));
        (bool ok, uint256 used) = _deliver(_msg(PredictionHub.Action.Bet, alice, true, 1e18));
        console2.log("late-bet refund gas", used, "limit", hubGas);
        assertTrue(ok, "refund must fit HUB_GAS_LIMIT");
    }

    function test_fork_findRoundOnLiveFeed() public {
        // Market that closed 2 hours ago on the real ETH/USD proxy (has phase bits in roundId).
        vm.warp(block.timestamp);
        (uint80 latest,,, uint256 latestAt,) = AggregatorV3Interface(base.ethUsdFeed).latestRoundData();
        console2.log("latest round", latest, "at", latestAt);
        // Pick a close time between two recent rounds.
        (,,, uint256 prevAt,) = AggregatorV3Interface(base.ethUsdFeed).getRoundData(latest - 3);
        uint64 close = uint64(prevAt + 1);
        // Recreate a market with that close by warping back.
        vm.warp(close - 10);
        hub.createMarket(base.ethUsdFeed, 2000e8, close, "past");
        vm.warp(latestAt + 1);
        uint80 r = hub.findResolutionRound(1);
        assertEq(r, latest - 2, "first round after close");
    }
}
