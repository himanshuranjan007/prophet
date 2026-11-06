// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RelayedFeed
/// @notice A Chainlink Data Feed mirrored onto this chain over CCIP. A FeedRelayer on the source
///         chain reads the real feed and sends each round here; this contract exposes them through
///         the standard AggregatorV3Interface so PredictionHub can settle markets against it.
/// @dev Rounds get local, gap-free ids (1, 2, 3...) so `getRoundData(id - 1)` is always the previous
///      relayed round. That keeps PredictionHub's "first round at/after close" check and its binary
///      search valid. The source round id is kept for audit. Rounds that are not newer than the
///      latest stored one are ignored rather than reverted (CCIP may deliver out of order).
contract RelayedFeed is CCIPReceiver, Ownable, AggregatorV3Interface {
    struct Round {
        int256 answer;
        uint64 startedAt;
        uint64 updatedAt;
        uint80 sourceRoundId;
    }

    uint8 public immutable override decimals;
    string public override description;

    uint64 public sourceChainSelector;
    address public sourceRelayer;

    uint80 public latestId;
    mapping(uint80 => Round) internal _rounds;

    event SourceSet(uint64 indexed chainSelector, address relayer);
    event RoundRelayed(uint80 indexed roundId, uint80 sourceRoundId, int256 answer, uint256 updatedAt, bytes32 ccipMessageId);
    event RoundIgnored(uint80 sourceRoundId, uint256 updatedAt, bytes32 ccipMessageId);

    error UntrustedSender(uint64 chainSelector, address sender);
    error NoData();

    constructor(address router, uint8 _decimals, string memory _description)
        CCIPReceiver(router)
        Ownable(msg.sender)
    {
        decimals = _decimals;
        description = _description;
    }

    function setSource(uint64 chainSelector, address relayer) external onlyOwner {
        sourceChainSelector = chainSelector;
        sourceRelayer = relayer;
        emit SourceSet(chainSelector, relayer);
    }

    // ---------------------------------------------------------------- CCIP
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        address sender = abi.decode(message.sender, (address));
        if (message.sourceChainSelector != sourceChainSelector || sender != sourceRelayer || sender == address(0)) {
            revert UntrustedSender(message.sourceChainSelector, sender);
        }
        (uint80 srcRound, int256 answer, uint256 startedAt, uint256 updatedAt) =
            abi.decode(message.data, (uint80, int256, uint256, uint256));

        // Stale, duplicate or out-of-order: keep the series strictly increasing in time.
        if (updatedAt <= _rounds[latestId].updatedAt) {
            emit RoundIgnored(srcRound, updatedAt, message.messageId);
            return;
        }
        uint80 id = latestId + 1;
        _rounds[id] = Round(answer, uint64(startedAt), uint64(updatedAt), srcRound);
        latestId = id;
        emit RoundRelayed(id, srcRound, answer, updatedAt, message.messageId);
    }

    // ---------------------------------------------------------------- AggregatorV3Interface
    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 roundId)
        public
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        if (roundId == 0 || roundId > latestId) revert NoData();
        Round storage r = _rounds[roundId];
        return (roundId, r.answer, r.startedAt, r.updatedAt, roundId);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return getRoundData(latestId);
    }

    /// @notice Source-chain round id that local round `roundId` mirrors.
    function sourceRoundOf(uint80 roundId) external view returns (uint80) {
        if (roundId == 0 || roundId > latestId) revert NoData();
        return _rounds[roundId].sourceRoundId;
    }
}
