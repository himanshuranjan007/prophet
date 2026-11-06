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

    function test_relayRevertsWhenNothingNew() public {
        relayer.relay();
        vm.expectRevert(abi.encodeWithSelector(FeedRelayer.NothingNew.selector, block.timestamp));
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
