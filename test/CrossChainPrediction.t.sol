// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulator, IRouterClient, BurnMintERC677Helper, LinkToken} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {MockV3Aggregator} from "@chainlink/local/src/data-feeds/MockV3Aggregator.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {PredictionHub} from "../src/PredictionHub.sol";
import {PredictionSpoke} from "../src/PredictionSpoke.sol";

/// @notice The local simulator uses one router for "both chains": the spoke sends to the hub's
///         selector and the hub receives from the same selector, which is exactly the trust path we
///         configure on testnets (hub.setSpoke(spokeSelector, spoke)).
contract CrossChainPredictionTest is Test {
    CCIPLocalSimulator sim;
    uint64 selector;
    IRouterClient router;
    BurnMintERC677Helper bnm;
    LinkToken link;
    MockV3Aggregator feed;

    PredictionHub hub;
    PredictionSpoke spoke;

    address alice = makeAddr("alice"); // bets YES from the spoke chain (e.g. Arbitrum)
    address bob = makeAddr("bob"); // bets NO directly on the hub chain (Base)
    address carol = makeAddr("carol"); // bets YES from the spoke chain

    uint64 closeTime;
    int256 constant STRIKE = 3000e8; // ETH/USD feeds use 8 decimals

    function setUp() public {
        sim = new CCIPLocalSimulator();
        (selector, router,,, link, bnm,) = sim.configuration();

        feed = new MockV3Aggregator(8, 2900e8);
        hub = new PredictionHub(address(router), address(bnm), address(link));
        spoke = new PredictionSpoke(address(router), address(bnm), selector, address(hub));
        hub.setSpoke(selector, address(spoke));
        hub.setFeedAllowed(address(feed), true);

        sim.requestLinkFromFaucet(address(hub), 10 ether);

        for (uint256 i; i < 3; i++) {
            bnm.drip(alice);
            bnm.drip(bob);
            bnm.drip(carol);
        }
        vm.prank(alice);
        bnm.approve(address(spoke), type(uint256).max);
        vm.prank(carol);
        bnm.approve(address(spoke), type(uint256).max);
        vm.prank(bob);
        bnm.approve(address(hub), type(uint256).max);

        closeTime = uint64(block.timestamp + 1 hours);
        hub.createMarket(address(feed), STRIKE, closeTime, "ETH above $3,000 in 1h?");
    }

    function _settlePrice(int256 price) internal {
        vm.warp(closeTime + 1);
        feed.updateAnswer(price);
        hub.resolve(0, hub.findResolutionRound(0));
    }

    function test_crossChainBetIsRecordedOnHub() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);

        PredictionHub.Market memory m = hub.getMarket(0);
        assertEq(m.yesPool, 1 ether);
        assertEq(hub.getPosition(0, alice, selector).yes, 1 ether);
        assertEq(bnm.balanceOf(address(hub)), 1 ether, "stake moved to hub via CCIP");
    }

    function test_fullRound_yesWins_payoutsOnEachChain() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        vm.prank(carol);
        spoke.placeBet(0, true, 2 ether);
        vm.prank(bob);
        hub.bet(0, false, 3 ether);

        _settlePrice(3100e8);
        assertEq(uint8(hub.getMarket(0).outcome), uint8(PredictionHub.Outcome.Yes));

        // pool = 6, yes = 3 -> 2x
        assertEq(hub.claimable(0, alice, selector), 2 ether);
        assertEq(hub.claimable(0, carol, selector), 4 ether);
        assertEq(hub.claimable(0, bob, hub.LOCAL()), 0);

        uint256 before = bnm.balanceOf(alice);
        vm.prank(alice);
        spoke.claim(0); // claim msg -> hub -> payout back over CCIP
        assertEq(bnm.balanceOf(alice) - before, 2 ether);

        vm.prank(carol);
        spoke.claim(0);
        assertEq(bnm.balanceOf(address(hub)), 0, "hub fully paid out");
    }

    function test_noWins_localClaim() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        vm.prank(bob);
        hub.bet(0, false, 1 ether);

        _settlePrice(2999e8);
        uint256 before = bnm.balanceOf(bob);
        vm.prank(bob);
        hub.claim(0);
        assertEq(bnm.balanceOf(bob) - before, 2 ether);

        vm.expectRevert(PredictionHub.NothingToClaim.selector);
        vm.prank(bob);
        hub.claim(0);
    }

    function test_lateCrossChainBetIsRefunded() public {
        vm.warp(closeTime); // CCIP message lands after close
        uint256 before = bnm.balanceOf(alice);
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        assertEq(bnm.balanceOf(alice), before, "refunded over CCIP");
        assertEq(hub.getMarket(0).yesPool, 0);
    }

    function test_oneSidedMarketRefundsEveryone() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        _settlePrice(3500e8);
        assertEq(uint8(hub.getMarket(0).outcome), uint8(PredictionHub.Outcome.Invalid));

        uint256 before = bnm.balanceOf(alice);
        vm.prank(alice);
        spoke.claim(0);
        assertEq(bnm.balanceOf(alice) - before, 1 ether);
    }

    function test_doubleClaimFromSpokeIsNoop() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        vm.prank(bob);
        hub.bet(0, false, 1 ether);
        _settlePrice(3100e8);

        vm.startPrank(alice);
        spoke.claim(0);
        uint256 afterFirst = bnm.balanceOf(alice);
        spoke.claim(0);
        vm.stopPrank();
        assertEq(bnm.balanceOf(alice), afterFirst);
    }

    function test_claimBeforeResolveIsNoop() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        vm.prank(alice);
        spoke.claim(0);
        assertEq(hub.getPosition(0, alice, selector).claimed, false);
    }

    function _twoSided() internal {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        vm.prank(bob);
        hub.bet(0, false, 1 ether);
    }

    function test_resolveRequiresRoundAfterClose() public {
        _twoSided();
        vm.warp(closeTime + 10);
        assertEq(hub.findResolutionRound(0), 0, "no round after close yet");
        vm.expectRevert(PredictionHub.BadRound.selector);
        hub.resolve(0, 1); // round 1 is from before close
    }

    function test_cannotCherryPickLaterRound() public {
        _twoSided();
        vm.warp(closeTime + 1);
        feed.updateAnswer(2900e8); // round 2: first after close -> NO
        vm.warp(closeTime + 600);
        feed.updateAnswer(3100e8); // round 3: later, favourable to YES
        assertEq(hub.findResolutionRound(0), 2);
        vm.expectRevert(PredictionHub.BadRound.selector);
        hub.resolve(0, 3);
        hub.resolve(0, 2);
        assertEq(uint8(hub.getMarket(0).outcome), uint8(PredictionHub.Outcome.No));
    }

    function test_findResolutionRoundBinarySearch() public {
        _twoSided();
        for (uint256 i; i < 20; i++) {
            vm.warp(block.timestamp + 5 minutes);
            feed.updateAnswer(3000e8 + int256(i));
        }
        uint80 r = hub.findResolutionRound(0);
        (,,, uint256 at,) = feed.getRoundData(r);
        (,,, uint256 prevAt,) = feed.getRoundData(r - 1);
        assertGe(at, closeTime);
        assertLt(prevAt, closeTime);
        hub.resolve(0, r);
    }

    function test_createMarketRequiresAllowedFeed() public {
        MockV3Aggregator fake = new MockV3Aggregator(8, 1);
        vm.expectRevert(abi.encodeWithSelector(PredictionHub.FeedNotAllowed.selector, address(fake)));
        hub.createMarket(address(fake), 1, closeTime, "rigged");
    }

    function test_voidStaleRefundsAfterGrace() public {
        _twoSided();
        vm.warp(closeTime + 1);
        vm.expectRevert(PredictionHub.GraceNotOver.selector);
        hub.voidStale(0);
        vm.warp(closeTime + hub.RESOLVE_GRACE());
        hub.voidStale(0);
        uint256 before = bnm.balanceOf(alice);
        vm.prank(alice);
        spoke.claim(0);
        assertEq(bnm.balanceOf(alice) - before, 1 ether);
    }

    function test_dustBetRejected() public {
        vm.prank(alice);
        vm.expectRevert(PredictionSpoke.BetTooSmall.selector);
        spoke.placeBet(0, true, 1e14);
    }

    function test_claimBeforeResolveEmitsIgnored() public {
        vm.prank(alice);
        spoke.placeBet(0, true, 1 ether);
        vm.expectEmit(true, true, true, true, address(hub));
        emit PredictionHub.ClaimIgnored(0, alice, selector);
        vm.prank(alice);
        spoke.claim(0);
    }

    function test_rejectsUntrustedSender() public {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: selector,
            sender: abi.encode(makeAddr("attacker")),
            data: abi.encode(PredictionHub.Action.Claim, uint256(0), alice, false),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert();
        hub.ccipReceive(m);
    }

    function test_onlyRouterCanDeliver() public {
        Client.Any2EVMMessage memory m;
        vm.expectRevert();
        hub.ccipReceive(m);
    }
}
