// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PredictionHub
/// @notice Home chain of every market. Holds all liquidity, records positions placed locally or
///         from spoke chains over CCIP, resolves markets with Chainlink Data Feeds, and pays winners
///         back on whichever chain they bet from.
/// @dev Parimutuel binary markets: "Will <feed> be above <strike> at <closeTime>?"
contract PredictionHub is CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types
    enum Outcome {
        Unresolved,
        Yes,
        No,
        Invalid // one side empty, or never resolved -> everyone refunded
    }

    enum Action {
        Bet,
        Claim
    }

    struct Market {
        string question;
        address feed;
        int256 strike;
        uint64 closeTime;
        uint256 yesPool;
        uint256 noPool;
        Outcome outcome;
        int256 finalPrice;
    }

    struct Position {
        uint256 yes;
        uint256 no;
        bool claimed;
    }

    /// @dev chainSelector used for positions placed directly on the hub chain.
    uint64 public constant LOCAL = 0;
    /// @dev Smallest accepted stake (anti-dust; refunds cost the hub LINK).
    uint256 public constant MIN_BET = 1e15; // 0.001 token
    /// @dev If a market is still unresolved this long after close, anyone may void it (full refunds).
    uint256 public constant RESOLVE_GRACE = 1 days;

    // ---------------------------------------------------------------- storage
    IERC20 public immutable betToken;
    IERC20 public immutable linkToken; // pays CCIP fees for payouts/refunds sent from the hub

    Market[] internal _markets;
    /// marketId => keccak(user, chainSelector) => position
    mapping(uint256 => mapping(bytes32 => Position)) internal _positions;
    /// source chainSelector => trusted spoke contract
    mapping(uint64 => address) public spokes;
    /// Chainlink Data Feed proxies markets may settle against (owner-curated)
    mapping(address => bool) public allowedFeeds;

    // ---------------------------------------------------------------- events
    event SpokeSet(uint64 indexed chainSelector, address spoke);
    event FeedAllowed(address indexed feed, bool allowed);
    event MarketCreated(uint256 indexed marketId, address feed, int256 strike, uint64 closeTime, string question);
    event BetPlaced(
        uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, bool yes, uint256 amount, bytes32 ccipMessageId
    );
    event BetRefunded(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, uint256 amount, bytes32 outMessageId);
    event MarketResolved(uint256 indexed marketId, Outcome outcome, int256 finalPrice, uint80 roundId);
    event Claimed(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, uint256 amount, bytes32 outMessageId);
    event ClaimIgnored(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector);

    // ---------------------------------------------------------------- errors
    error UntrustedSender(uint64 chainSelector, address sender);
    error InvalidMarket();
    error FeedNotAllowed(address feed);
    error MarketClosed();
    error MarketNotClosed();
    error AlreadyResolved();
    error BadRound();
    error BetTooSmall();
    error NotResolved();
    error NothingToClaim();
    error GraceNotOver();
    error MissingTokens();

    constructor(address router, address _betToken, address _link) CCIPReceiver(router) Ownable(msg.sender) {
        betToken = IERC20(_betToken);
        linkToken = IERC20(_link);
        // Router pulls the LINK fee inside ccipSend; avoids a ~130k-gas getFee call per payout.
        IERC20(_link).forceApprove(router, type(uint256).max);
    }

    // ================================================================ admin
    function setSpoke(uint64 chainSelector, address spoke) external onlyOwner {
        spokes[chainSelector] = spoke;
        emit SpokeSet(chainSelector, spoke);
    }

    function setFeedAllowed(address feed, bool allowed) external onlyOwner {
        allowedFeeds[feed] = allowed;
        emit FeedAllowed(feed, allowed);
    }

    function withdrawLink(address to, uint256 amount) external onlyOwner {
        linkToken.safeTransfer(to, amount);
    }

    // ================================================================ markets
    /// @notice Anyone can open a market on an allowlisted Chainlink Data Feed.
    /// @param strike In the feed's own decimals (ETH/USD: 8).
    function createMarket(address feed, int256 strike, uint64 closeTime, string calldata question)
        external
        returns (uint256 marketId)
    {
        if (!allowedFeeds[feed]) revert FeedNotAllowed(feed);
        if (strike <= 0 || closeTime <= block.timestamp) revert InvalidMarket();
        marketId = _markets.length;
        _markets.push(
            Market({
                question: question,
                feed: feed,
                strike: strike,
                closeTime: closeTime,
                yesPool: 0,
                noPool: 0,
                outcome: Outcome.Unresolved,
                finalPrice: 0
            })
        );
        emit MarketCreated(marketId, feed, strike, closeTime, question);
    }

    /// @notice Bet directly on the hub chain.
    function bet(uint256 marketId, bool yes, uint256 amount) external {
        if (amount < MIN_BET) revert BetTooSmall();
        if (!_isOpen(marketId)) revert MarketClosed();
        betToken.safeTransferFrom(msg.sender, address(this), amount);
        _record(marketId, msg.sender, LOCAL, yes, amount, bytes32(0));
    }

    /// @notice Settle against the FIRST feed round published at/after closeTime. Anyone can call;
    ///         the round is pinned, so the caller cannot pick a favourable later price.
    /// @param roundId Use `findResolutionRound(marketId)` to get it.
    function resolve(uint256 marketId, uint80 roundId) external {
        Market storage m = _market(marketId);
        if (m.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp < m.closeTime) revert MarketNotClosed();

        // One-sided market: nothing to decide, refund everyone (no feed dependency).
        if (m.yesPool == 0 || m.noPool == 0) {
            m.outcome = Outcome.Invalid;
            emit MarketResolved(marketId, Outcome.Invalid, 0, 0);
            return;
        }

        AggregatorV3Interface feed = AggregatorV3Interface(m.feed);
        (, int256 price,, uint256 updatedAt,) = feed.getRoundData(roundId);
        if (updatedAt < m.closeTime || price <= 0) revert BadRound();
        // Previous round in the same phase must be before close (=> this is the first one after).
        if (uint64(roundId) > 1) {
            (,,, uint256 prevUpdatedAt,) = feed.getRoundData(roundId - 1);
            if (prevUpdatedAt >= m.closeTime) revert BadRound();
        }

        m.finalPrice = price;
        m.outcome = price > m.strike ? Outcome.Yes : Outcome.No;
        emit MarketResolved(marketId, m.outcome, price, roundId);
    }

    /// @notice Escape hatch: a market nobody could resolve within RESOLVE_GRACE is voided (refunds).
    function voidStale(uint256 marketId) external {
        Market storage m = _market(marketId);
        if (m.outcome != Outcome.Unresolved) revert AlreadyResolved();
        if (block.timestamp < m.closeTime + RESOLVE_GRACE) revert GraceNotOver();
        m.outcome = Outcome.Invalid;
        emit MarketResolved(marketId, Outcome.Invalid, 0, 0);
    }

    /// @notice Claim for a position placed on the hub chain.
    function claim(uint256 marketId) external {
        uint256 amount = _settle(marketId, msg.sender, LOCAL);
        if (amount == 0) revert NothingToClaim();
        betToken.safeTransfer(msg.sender, amount);
        emit Claimed(marketId, msg.sender, LOCAL, amount, bytes32(0));
    }

    // ================================================================ CCIP
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        uint64 src = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));
        if (sender == address(0) || spokes[src] != sender) revert UntrustedSender(src, sender);

        (Action action, uint256 marketId, address user, bool yes) =
            abi.decode(message.data, (Action, uint256, address, bool));

        if (action == Action.Bet) {
            // Trusted spokes always attach exactly one token amount to a bet.
            if (message.destTokenAmounts.length != 1) revert MissingTokens();
            address token = message.destTokenAmounts[0].token;
            uint256 amount = message.destTokenAmounts[0].amount;
            // Bet arrived after close (CCIP latency), for a bad market, or is dust: send it back.
            if (token != address(betToken) || amount < MIN_BET || !_isOpen(marketId)) {
                bytes32 out = _sendTokens(src, user, token, amount);
                emit BetRefunded(marketId, user, src, amount, out);
                return;
            }
            _record(marketId, user, src, yes, amount, message.messageId);
        } else {
            // Claim request from a spoke: never revert, just no-op if nothing is owed (yet).
            if (marketId >= _markets.length || _markets[marketId].outcome == Outcome.Unresolved) {
                emit ClaimIgnored(marketId, user, src);
                return;
            }
            uint256 amount = _settle(marketId, user, src);
            if (amount == 0) {
                emit ClaimIgnored(marketId, user, src);
                return;
            }
            bytes32 out = _sendTokens(src, user, address(betToken), amount);
            emit Claimed(marketId, user, src, amount, out);
        }
    }

    /// @dev Reverts (=> CCIP message marked failed, manually re-executable) if the hub lacks LINK.
    function _sendTokens(uint64 destSelector, address to, address token, uint256 amount)
        internal
        returns (bytes32 messageId)
    {
        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](1);
        tokens[0] = Client.EVMTokenAmount({token: token, amount: amount});

        Client.EVM2AnyMessage memory msg_ = Client.EVM2AnyMessage({
            receiver: abi.encode(to),
            data: "",
            tokenAmounts: tokens,
            feeToken: address(linkToken),
            // gasLimit 0: plain token transfer to the user's wallet, no callback.
            extraArgs: Client._argsToBytes(Client.GenericExtraArgsV2({gasLimit: 0, allowOutOfOrderExecution: true}))
        });

        address router = getRouter();
        IERC20(token).forceApprove(router, amount);
        messageId = IRouterClient(router).ccipSend(destSelector, msg_);
    }

    // ================================================================ internals
    function _record(uint256 marketId, address user, uint64 chain, bool yes, uint256 amount, bytes32 msgId) internal {
        Market storage m = _markets[marketId];
        Position storage p = _positions[marketId][_key(user, chain)];
        if (yes) {
            m.yesPool += amount;
            p.yes += amount;
        } else {
            m.noPool += amount;
            p.no += amount;
        }
        emit BetPlaced(marketId, user, chain, yes, amount, msgId);
    }

    function _settle(uint256 marketId, address user, uint64 chain) internal returns (uint256 amount) {
        Market storage m = _market(marketId);
        if (m.outcome == Outcome.Unresolved) revert NotResolved();
        Position storage p = _positions[marketId][_key(user, chain)];
        if (p.claimed) return 0;
        amount = _payout(m, p);
        if (amount > 0) p.claimed = true;
    }

    function _payout(Market storage m, Position storage p) internal view returns (uint256) {
        if (m.outcome == Outcome.Invalid) return p.yes + p.no;
        uint256 total = m.yesPool + m.noPool;
        if (m.outcome == Outcome.Yes) return m.yesPool == 0 ? 0 : (p.yes * total) / m.yesPool;
        if (m.outcome == Outcome.No) return m.noPool == 0 ? 0 : (p.no * total) / m.noPool;
        return 0;
    }

    function _isOpen(uint256 marketId) internal view returns (bool) {
        if (marketId >= _markets.length) return false;
        Market storage m = _markets[marketId];
        return m.outcome == Outcome.Unresolved && block.timestamp < m.closeTime;
    }

    function _market(uint256 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert InvalidMarket();
        return _markets[marketId];
    }

    function _key(address user, uint64 chain) internal pure returns (bytes32) {
        return keccak256(abi.encode(user, chain));
    }

    // ================================================================ views
    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function getPosition(uint256 marketId, address user, uint64 chain) external view returns (Position memory) {
        return _positions[marketId][_key(user, chain)];
    }

    /// @notice What `user` (who bet from `chain`) would receive if they claimed now.
    function claimable(uint256 marketId, address user, uint64 chain) external view returns (uint256) {
        Market storage m = _market(marketId);
        Position storage p = _positions[marketId][_key(user, chain)];
        if (m.outcome == Outcome.Unresolved || p.claimed) return 0;
        return _payout(m, p);
    }

    /// @notice Binary-searches the feed's current phase for the first round with updatedAt >= closeTime.
    /// @return roundId 0 if no such round exists yet (feed hasn't updated since close).
    function findResolutionRound(uint256 marketId) external view returns (uint80 roundId) {
        Market storage m = _market(marketId);
        AggregatorV3Interface feed = AggregatorV3Interface(m.feed);
        (uint80 latest,,, uint256 latestAt,) = feed.latestRoundData();
        if (latestAt < m.closeTime) return 0;

        uint80 phaseBase = (latest >> 64) << 64;
        uint64 lo = 1;
        uint64 hi = uint64(latest);
        while (lo < hi) {
            uint64 mid = lo + (hi - lo) / 2;
            (,,, uint256 at,) = feed.getRoundData(phaseBase | mid);
            if (at >= m.closeTime) hi = mid;
            else lo = mid + 1;
        }
        return phaseBase | lo;
    }
}
