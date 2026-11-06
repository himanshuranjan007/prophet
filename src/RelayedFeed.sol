// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RelayedFeed
/// @notice A Chainlink Data Feed mirrored onto this chain over CCIP. A FeedRelayer on the source chain
///         reads the real feed and sends its rounds here; this contract exposes them through the
///         standard AggregatorV3Interface so PredictionHub can settle markets against it.
/// @dev Exactness: the mirror is a gap-free copy of the source round sequence. A round is appended only
///      when it is the source's next round; rounds that arrive early (CCIP 2.0 has no ordering) wait in
///      a buffer until the gap is relayed. So local round k-1 is always the source round right before
///      local round k, and PredictionHub's "first round at/after close" check stays exact: relaying a
///      later round can't skip the real first-after-close round, it can only wait for it.
///      Local ids are 1, 2, 3... (phase 0), which keeps the hub's binary search valid.
contract RelayedFeed is CCIPReceiver, Ownable, AggregatorV3Interface {
    struct Round {
        int256 answer;
        uint64 startedAt;
        uint64 updatedAt;
        uint80 sourceRoundId;
    }

    uint80 internal constant LOW64 = type(uint64).max;
    /// @dev Buffered rounds appended per incoming message; more can be drained with drain().
    uint256 internal constant DRAIN_PER_MESSAGE = 2;

    uint8 public immutable override decimals;
    string public override description;

    uint64 public sourceChainSelector;
    address public sourceRelayer;

    uint80 public latestId;
    /// @notice Source round id of the latest local round (0 before the first relay).
    uint80 public lastSourceRound;
    mapping(uint80 => Round) internal _rounds;
    /// @notice Rounds that arrived ahead of a gap, keyed by source round id.
    mapping(uint80 => Round) public buffered;

    event SourceSet(uint64 indexed chainSelector, address relayer);
    event RoundRelayed(uint80 indexed roundId, uint80 sourceRoundId, int256 answer, uint256 updatedAt);
    event RoundBuffered(uint80 indexed sourceRoundId, uint80 waitingFor, bytes32 ccipMessageId);
    event RoundIgnored(uint80 sourceRoundId, bytes32 ccipMessageId);

    error UntrustedSender(uint64 chainSelector, address sender);
    error NoData();

    constructor(address router, uint8 _decimals, string memory _description) CCIPReceiver(router) Ownable(msg.sender) {
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
        (uint80 src, int256 answer, uint256 startedAt, uint256 updatedAt) =
            abi.decode(message.data, (uint80, int256, uint256, uint256));
        Round memory r = Round(answer, uint64(startedAt), uint64(updatedAt), src);

        if (latestId == 0) {
            _append(r); // genesis: the mirror starts at whichever round is relayed first
        } else if (src <= lastSourceRound) {
            emit RoundIgnored(src, message.messageId); // duplicate or older
            return;
        } else if (_isNext(src)) {
            _append(r);
        } else {
            buffered[src] = r; // early: wait for the gap to be relayed
            emit RoundBuffered(src, _next(lastSourceRound), message.messageId);
            return;
        }
        _drain(DRAIN_PER_MESSAGE);
    }

    /// @notice Append buffered rounds that are now contiguous (anyone can call; useful after a long gap).
    function drain(uint256 max) external {
        _drain(max);
    }

    function _drain(uint256 max) internal {
        for (uint256 i; i < max; i++) {
            uint80 nxt = _next(lastSourceRound);
            Round memory b = buffered[nxt];
            if (b.updatedAt == 0) {
                // a new phase starts at aggregator round 1 of the next phase id
                uint80 phaseStart = ((lastSourceRound >> 64) + 1) << 64 | 1;
                b = buffered[phaseStart];
                if (b.updatedAt == 0) return;
                nxt = phaseStart;
            }
            delete buffered[nxt];
            _append(b);
        }
    }

    function _append(Round memory r) internal {
        uint80 id = latestId + 1;
        _rounds[id] = r;
        latestId = id;
        lastSourceRound = r.sourceRoundId;
        emit RoundRelayed(id, r.sourceRoundId, r.answer, r.updatedAt);
    }

    function _next(uint80 src) internal pure returns (uint80) {
        return src + 1;
    }

    function _isNext(uint80 src) internal view returns (bool) {
        if (src == lastSourceRound + 1) return true;
        // proxy phase change: next phase id, aggregator round 1
        return (src >> 64) == (lastSourceRound >> 64) + 1 && (src & LOW64) == 1;
    }

    // ---------------------------------------------------------------- AggregatorV3Interface
    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 roundId) public view override returns (uint80, int256, uint256, uint256, uint80) {
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
