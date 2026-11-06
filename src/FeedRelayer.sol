// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title FeedRelayer
/// @notice Lives on the chain that has a Chainlink Data Feed (e.g. SOL/USD on Arbitrum Sepolia) and
///         ships its rounds over CCIP to a RelayedFeed on the hub chain. Permissionless: anyone (a user,
///         a keeper, a CRE workflow) can pay the CCIP fee to relay the latest round or any specific one.
/// @dev The RelayedFeed only accepts rounds in source order, so relaying a later round can never skip
///      an earlier one: a missing round simply holds the mirror until someone relays it (relayRound).
contract FeedRelayer {
    IRouterClient public immutable router;
    AggregatorV3Interface public immutable feed;
    uint64 public immutable destChainSelector;
    address public immutable destFeed;

    /// @dev Gas for RelayedFeed._ccipReceive: append (2 fresh slots) + drain up to 2 buffered rounds.
    uint32 public constant DEST_GAS_LIMIT = 300_000;

    /// @notice Source round ids already sent (avoids paying twice for the same round).
    mapping(uint80 => bool) public sent;

    event Relayed(bytes32 indexed messageId, uint80 indexed sourceRoundId, int256 answer, uint256 updatedAt, uint256 fee);

    error AlreadySent(uint80 roundId);
    error NoRound(uint80 roundId);
    error InsufficientFee(uint256 sent, uint256 required);
    error RefundFailed();

    constructor(address _router, address _feed, uint64 _destChainSelector, address _destFeed) {
        router = IRouterClient(_router);
        feed = AggregatorV3Interface(_feed);
        destChainSelector = _destChainSelector;
        destFeed = _destFeed;
    }

    /// @notice Relay the feed's latest round.
    function relay() external payable returns (bytes32) {
        (uint80 roundId,,,,) = feed.latestRoundData();
        return _relay(roundId);
    }

    /// @notice Relay a specific source round (e.g. the first one after a market's close, or a gap).
    function relayRound(uint80 roundId) external payable returns (bytes32) {
        return _relay(roundId);
    }

    /// @notice Fee to relay the latest round, and whether it hasn't been sent yet.
    function quote() external view returns (uint256 fee, bool hasNew) {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt,) = feed.latestRoundData();
        hasNew = !sent[roundId];
        fee = router.getFee(destChainSelector, _message(roundId, answer, startedAt, updatedAt));
    }

    /// @notice Fee to relay a specific round.
    function quoteRound(uint80 roundId) external view returns (uint256 fee) {
        (, int256 answer, uint256 startedAt, uint256 updatedAt,) = feed.getRoundData(roundId);
        fee = router.getFee(destChainSelector, _message(roundId, answer, startedAt, updatedAt));
    }

    function _relay(uint80 roundId) internal returns (bytes32 messageId) {
        if (sent[roundId]) revert AlreadySent(roundId);
        (uint80 rid, int256 answer, uint256 startedAt, uint256 updatedAt,) = feed.getRoundData(roundId);
        if (updatedAt == 0 || rid != roundId) revert NoRound(roundId);
        sent[roundId] = true;

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
