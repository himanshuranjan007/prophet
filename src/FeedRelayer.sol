// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title FeedRelayer
/// @notice Lives on the chain that has a Chainlink Data Feed (e.g. SOL/USD on Arbitrum Sepolia) and
///         ships its latest round over CCIP to a RelayedFeed on the hub chain. Permissionless: anyone
///         (a user, a keeper, a CRE workflow) can pay the CCIP fee to push the newest price.
contract FeedRelayer {
    IRouterClient public immutable router;
    AggregatorV3Interface public immutable feed;
    uint64 public immutable destChainSelector;
    address public immutable destFeed;

    /// @dev Gas for RelayedFeed._ccipReceive (2 fresh slots + event); measured ~75k, generous margin.
    uint32 public constant DEST_GAS_LIMIT = 200_000;

    /// @notice updatedAt of the last round sent, to avoid paying twice for the same round.
    uint256 public lastSentUpdatedAt;

    event Relayed(bytes32 indexed messageId, uint80 indexed sourceRoundId, int256 answer, uint256 updatedAt, uint256 fee);

    error NothingNew(uint256 updatedAt);
    error InsufficientFee(uint256 sent, uint256 required);
    error RefundFailed();

    constructor(address _router, address _feed, uint64 _destChainSelector, address _destFeed) {
        router = IRouterClient(_router);
        feed = AggregatorV3Interface(_feed);
        destChainSelector = _destChainSelector;
        destFeed = _destFeed;
    }

    /// @notice Send the feed's latest round to the hub chain. Reverts if it was already sent.
    function relay() external payable returns (bytes32 messageId) {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt,) = feed.latestRoundData();
        if (updatedAt <= lastSentUpdatedAt) revert NothingNew(updatedAt);
        lastSentUpdatedAt = updatedAt;

        Client.EVM2AnyMessage memory m = _message(roundId, answer, startedAt, updatedAt);
        uint256 fee = router.getFee(destChainSelector, m);
        if (msg.value < fee) revert InsufficientFee(msg.value, fee);
        messageId = router.ccipSend{value: fee}(destChainSelector, m);
        emit Relayed(messageId, roundId, answer, updatedAt, fee);

        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice Native fee to relay the current latest round (0 if there's nothing new to send).
    function quote() external view returns (uint256 fee, bool hasNew) {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt,) = feed.latestRoundData();
        hasNew = updatedAt > lastSentUpdatedAt;
        fee = router.getFee(destChainSelector, _message(roundId, answer, startedAt, updatedAt));
    }

    function _message(uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt)
        internal
        view
        returns (Client.EVM2AnyMessage memory)
    {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(destFeed),
            data: abi.encode(roundId, answer, startedAt, updatedAt),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            feeToken: address(0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: DEST_GAS_LIMIT, allowOutOfOrderExecution: true})
            )
        });
    }
}
