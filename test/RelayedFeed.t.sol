// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CCIPLocalSimulator, IRouterClient, BurnMintERC677Helper, LinkToken} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {MockV3Aggregator} from "@chainlink/local/src/data-feeds/MockV3Aggregator.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {RelayedFeed} from "../src/RelayedFeed.sol";
import {FeedRelayer} from "../src/FeedRelayer.sol";
import {PredictionHub} from "../src/PredictionHub.sol";

/// SOL/USD lives on Arbitrum; FeedRelayer ships rounds over CCIP to RelayedFeed on Base,
/// which PredictionHub settles against like any other Chainlink feed.
contract RelayedFeedTest is Test {
    CCIPLocalSimulator sim;
    uint64 selector;
    IRouterClient router;
    BurnMintERC677Helper bnm;
    LinkToken link;

    MockV3Aggregator sol; // the "source" Chainlink feed
    RelayedFeed mirror;
    FeedRelayer relayer;
    PredictionHub hub;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        sim = new CCIPLocalSimulator();
        (selector, router,,, link, bnm,) = sim.configuration();
        vm.warp(1_000_000);
        sol = new MockV3Aggregator(8, 150e8);
        mirror = new RelayedFeed(address(router), 8, "SOL / USD (via CCIP)");
        relayer = new FeedRelayer(address(router), address(sol), selector, address(mirror));
        mirror.setSource(selector, address(relayer));
    }

    function test_relayStoresRoundWithLocalIds() public {
        relayer.relay();
        assertEq(mirror.latestId(), 1);
        (uint80 id, int256 answer,, uint256 updatedAt, uint80 answeredIn) = mirror.latestRoundData();
        assertEq(id, 1);
        assertEq(answer, 150e8);
        assertEq(updatedAt, block.timestamp);
        assertEq(answeredIn, 1);
        assertEq(mirror.sourceRoundOf(1), 1);
        assertEq(mirror.decimals(), 8);

        vm.warp(block.timestamp + 600);
        sol.updateAnswer(152e8);
        relayer.relay();
        assertEq(mirror.latestId(), 2);
        (, int256 a2,,,) = mirror.getRoundData(2);
        assertEq(a2, 152e8);
    }

    function test_relayRevertsWhenAlreadySent() public {
        relayer.relay();
        vm.expectRevert(abi.encodeWithSelector(FeedRelayer.AlreadySent.selector, uint80(1)));
        relayer.relay();
        (, bool hasNew) = relayer.quote();
        assertFalse(hasNew);
    }

    function test_relayRefundsExcessFee() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        relayer.relay{value: 1 ether}(); // local router fee is 0
        assertEq(alice.balance, 1 ether);
    }

    function test_staleOrOutOfOrderRoundIsIgnoredNotReverted() public {
        relayer.relay(); // round 1 @ t0
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(uint256(7)),
            sourceChainSelector: selector,
            sender: abi.encode(address(relayer)),
            data: abi.encode(uint80(0), int256(1e8), block.timestamp - 100, block.timestamp - 100),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        mirror.ccipReceive(m); // older than latest -> ignored
        assertEq(mirror.latestId(), 1);
        (, int256 answer,,,) = mirror.latestRoundData();
        assertEq(answer, 150e8);
    }

    function test_rejectsUntrustedSender() public {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: selector,
            sender: abi.encode(makeAddr("attacker")),
            data: abi.encode(uint80(9), int256(1), block.timestamp + 1, block.timestamp + 1),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        vm.expectRevert();
        mirror.ccipReceive(m);
    }

    function test_onlyOwnerSetsSource() public {
        vm.prank(alice);
        vm.expectRevert();
        mirror.setSource(selector, alice);
    }

    function test_noDataBeforeFirstRelay() public {
        vm.expectRevert(RelayedFeed.NoData.selector);
        mirror.latestRoundData();
        vm.expectRevert(RelayedFeed.NoData.selector);
        mirror.getRoundData(0);
    }

    // ------------------------------------------------------------ ordering (CCIP 2.0 has none)
    function _deliver(uint80 srcRound, int256 answer, uint256 t) internal {
        Client.Any2EVMMessage memory m = Client.Any2EVMMessage({
            messageId: keccak256(abi.encode(srcRound)),
            sourceChainSelector: selector,
            sender: abi.encode(address(relayer)),
            data: abi.encode(srcRound, answer, t, t),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        vm.prank(address(router));
        mirror.ccipReceive(m);
    }

    function test_outOfOrderRoundsWaitForTheGap() public {
        _deliver(1, 100e8, 1000); // genesis
        _deliver(3, 103e8, 3000); // early: buffered
        assertEq(mirror.latestId(), 1, "round 3 must not skip round 2");
        (,,, uint256 bufT,) = _bufferedOf(3);
        assertEq(bufT, 3000);
        _deliver(2, 102e8, 2000); // fills the gap -> 2 then 3 drained
        assertEq(mirror.latestId(), 3);
        assertEq(mirror.sourceRoundOf(2), 2);
        assertEq(mirror.sourceRoundOf(3), 3);
        (, int256 a3,,,) = mirror.getRoundData(3);
        assertEq(a3, 103e8);
    }

    function test_drainIsBoundedPerMessageAndPublic() public {
        _deliver(1, 1, 1000);
        for (uint80 r = 3; r <= 7; r++) _deliver(r, int256(uint256(r)), 1000 * r);
        _deliver(2, 2, 2000); // appends 2, then drains at most 2 (3, 4)
        assertEq(mirror.latestId(), 4);
        mirror.drain(10); // anyone can finish the job
        assertEq(mirror.latestId(), 7);
        assertEq(mirror.sourceRoundOf(7), 7);
    }

    function test_relayRoundCanBackfillASpecificRound() public {
        relayer.relay(); // src 1
        vm.warp(block.timestamp + 60);
        sol.updateAnswer(151e8); // src 2
        vm.warp(block.timestamp + 60);
        sol.updateAnswer(152e8); // src 3
        relayer.relayRound(3); // later round first -> buffered (local router delivers instantly)
        assertEq(mirror.latestId(), 1);
        relayer.relayRound(2);
        assertEq(mirror.latestId(), 3);
        vm.expectRevert(abi.encodeWithSelector(FeedRelayer.AlreadySent.selector, uint80(2)));
        relayer.relayRound(2);
    }

    function _bufferedOf(uint80 src) internal view returns (int256, uint64, uint64, uint256, uint80) {
        (int256 answer, uint64 startedAt, uint64 updatedAt, uint80 sourceRoundId) = mirror.buffered(src);
        return (answer, startedAt, updatedAt, updatedAt, sourceRoundId);
    }

    // ------------------------------------------------------------ hub integration
    function _hubWithSolMarket() internal returns (uint64 closeTime) {
        hub = new PredictionHub(address(router), address(bnm), address(link));
        hub.setFeedAllowed(address(mirror), true);
        relayer.relay(); // first SOL price on the hub chain
        closeTime = uint64(block.timestamp + 1 hours);
        hub.createMarket(address(mirror), 151e8, closeTime, "Will SOL be above $151 at close?");
        bnm.drip(alice);
        bnm.drip(bob);
        vm.prank(alice);
        bnm.approve(address(hub), type(uint256).max);
        vm.prank(bob);
        bnm.approve(address(hub), type(uint256).max);
        vm.prank(alice);
        hub.bet(0, true, 1 ether);
        vm.prank(bob);
        hub.bet(0, false, 1 ether);
    }

    function test_relayingOnlyALaterRoundCannotSkipTheFirstAfterClose() public {
        uint64 closeTime = _hubWithSolMarket(); // src 1 relayed
        vm.warp(closeTime + 30);
        sol.updateAnswer(155e8); // src 2: first after close -> YES
        vm.warp(closeTime + 700);
        sol.updateAnswer(140e8); // src 3: later -> NO
        relayer.relayRound(3); // a NO holder relays only the later round
        assertEq(hub.findResolutionRound(0), 0, "can't resolve on round 3 while round 2 is missing");
        relayer.relayRound(2); // anyone backfills the real first-after-close round
        uint80 r = hub.findResolutionRound(0);
        assertEq(mirror.sourceRoundOf(r), 2);
        hub.resolve(0, r);
        assertEq(uint8(hub.getMarket(0).outcome), uint8(PredictionHub.Outcome.Yes));
        assertEq(hub.getMarket(0).finalPrice, 155e8);
    }

    function test_hubSettlesSolMarketOnFirstRelayedRoundAfterClose() public {
        uint64 closeTime = _hubWithSolMarket();

        vm.warp(closeTime - 60);
        sol.updateAnswer(149e8);
        relayer.relay(); // round 2, before close

        vm.warp(closeTime + 30);
        assertEq(hub.findResolutionRound(0), 0, "nothing relayed after close yet");

        sol.updateAnswer(153e8);
        relayer.relay(); // round 3, first after close -> YES
        vm.warp(closeTime + 900);
        sol.updateAnswer(140e8);
        relayer.relay(); // round 4, later

        assertEq(hub.findResolutionRound(0), 3);
        vm.expectRevert(PredictionHub.BadRound.selector);
        hub.resolve(0, 4); // can't cherry-pick a later relayed round
        hub.resolve(0, 3);
        assertEq(uint8(hub.getMarket(0).outcome), uint8(PredictionHub.Outcome.Yes));
        assertEq(hub.getMarket(0).finalPrice, 153e8);
    }
}
