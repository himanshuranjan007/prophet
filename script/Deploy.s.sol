// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {PredictionHub} from "../src/PredictionHub.sol";
import {PredictionSpoke} from "../src/PredictionSpoke.sol";
import {Networks} from "./Networks.sol";

/// forge script script/Deploy.s.sol:DeployHub --rpc-url baseSepolia --broadcast
/// env: PRIVATE_KEY, HUB_LINK_FUNDING (wei of LINK sent to the hub for payout fees; required > 0)
contract DeployHub is Script {
    function run() external returns (PredictionHub hub) {
        Networks.Net memory n = Networks.baseSepolia();
        require(block.chainid == n.chainId, "run on Base Sepolia");
        uint256 linkFunding = vm.envUint("HUB_LINK_FUNDING");
        require(linkFunding > 0, "HUB_LINK_FUNDING must be > 0: hub pays CCIP payout fees in LINK");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        hub = new PredictionHub(n.router, n.bnm, n.link);
        hub.setFeedAllowed(n.ethUsdFeed, true);
        IERC20(n.link).transfer(address(hub), linkFunding);
        vm.stopBroadcast();

        console2.log("HUB_ADDRESS=", address(hub));
    }
}

/// forge script script/Deploy.s.sol:DeploySpoke --rpc-url arbitrumSepolia --broadcast
/// env: PRIVATE_KEY, HUB_ADDRESS
contract DeploySpoke is Script {
    function run() external returns (PredictionSpoke spoke) {
        Networks.Net memory n = Networks.byChainId(block.chainid);
        require(n.chainId != Networks.baseSepolia().chainId, "spokes go on non-hub chains");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        spoke = new PredictionSpoke(n.router, n.bnm, Networks.baseSepolia().selector, vm.envAddress("HUB_ADDRESS"));
        vm.stopBroadcast();

        console2.log("chainSelector", n.selector);
        console2.log("SPOKE_ADDRESS=", address(spoke));
    }
}

/// Trust a spoke on the hub.
/// forge script script/Deploy.s.sol:SetSpoke --rpc-url baseSepolia --broadcast
/// env: PRIVATE_KEY, HUB_ADDRESS, SPOKE_CHAIN_ID (421614 | 11155111), SPOKE_ADDRESS
contract SetSpoke is Script {
    function run() external {
        uint64 sel = Networks.byChainId(vm.envUint("SPOKE_CHAIN_ID")).selector;
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        PredictionHub(vm.envAddress("HUB_ADDRESS")).setSpoke(sel, vm.envAddress("SPOKE_ADDRESS"));
        vm.stopBroadcast();
    }
}

/// forge script script/Deploy.s.sol:CreateMarket --rpc-url baseSepolia --broadcast
/// env: PRIVATE_KEY, HUB_ADDRESS, optional STRIKE (8 dec; default = live ETH/USD rounded to $10),
///      DURATION (seconds, default 2h — keep >= 1h so cross-chain bets land before close), QUESTION
contract CreateMarket is Script {
    function run() external {
        address feed = Networks.baseSepolia().ethUsdFeed;
        (, int256 live,,,) = AggregatorV3Interface(feed).latestRoundData();
        int256 strike = vm.envOr("STRIKE", (live / 10e8) * 10e8);
        uint256 duration = vm.envOr("DURATION", uint256(2 hours));
        string memory q = vm.envOr(
            "QUESTION", string.concat("Will ETH be above $", vm.toString(uint256(strike / 1e8)), " at close?")
        );

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        uint256 id = PredictionHub(vm.envAddress("HUB_ADDRESS")).createMarket(
            feed, strike, uint64(block.timestamp + duration), q
        );
        vm.stopBroadcast();
        console2.log("marketId", id);
        console2.log(q);
    }
}

/// forge script script/Deploy.s.sol:Resolve --rpc-url baseSepolia --broadcast
/// env: PRIVATE_KEY, HUB_ADDRESS, MARKET_ID
contract Resolve is Script {
    function run() external {
        PredictionHub hub = PredictionHub(vm.envAddress("HUB_ADDRESS"));
        uint256 id = vm.envUint("MARKET_ID");
        uint80 r = hub.findResolutionRound(id);
        PredictionHub.Market memory m = hub.getMarket(id);
        // One-sided markets resolve Invalid without a round.
        require(r != 0 || m.yesPool == 0 || m.noPool == 0, "feed has not updated since close yet");
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        hub.resolve(id, r);
        vm.stopBroadcast();
        console2.log("resolved with round", r);
    }
}
