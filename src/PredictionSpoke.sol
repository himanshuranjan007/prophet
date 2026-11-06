// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PredictionSpoke
/// @notice Entry point on a non-hub chain. Users bet and claim from here; tokens and instructions
///         travel to the PredictionHub via CCIP. Winnings come back straight to the user's wallet.
/// @dev Users pay the CCIP fee in native gas (msg.value). Use `quoteBet` / `quoteClaim` first.
contract PredictionSpoke {
    using SafeERC20 for IERC20;

    enum Action {
        Bet,
        Claim
    }

    IRouterClient public immutable router;
    IERC20 public immutable betToken;
    uint64 public immutable hubChainSelector;
    address public immutable hub;

    /// @dev Gas for PredictionHub._ccipReceive. Claim+payout measured ~481k on a Base Sepolia
    ///      fork (CCIP 2.0 OnRamp); 1M leaves headroom and is far below the lane max (15M).
    uint32 public constant HUB_GAS_LIMIT = 1_000_000;
    /// @dev Must match PredictionHub.MIN_BET.
    uint256 public constant MIN_BET = 1e15;

    event BetSent(bytes32 indexed messageId, uint256 indexed marketId, address indexed user, bool yes, uint256 amount, uint256 fee);
    event ClaimSent(bytes32 indexed messageId, uint256 indexed marketId, address indexed user, uint256 fee);

    error BetTooSmall();
    error InsufficientFee(uint256 sent, uint256 required);
    error RefundFailed();

    constructor(address _router, address _betToken, uint64 _hubChainSelector, address _hub) {
        router = IRouterClient(_router);
        betToken = IERC20(_betToken);
        hubChainSelector = _hubChainSelector;
        hub = _hub;
    }

    // ---------------------------------------------------------------- actions
    /// @notice Bet `amount` on YES/NO of hub market `marketId`. Requires prior approve() of betToken.
    function placeBet(uint256 marketId, bool yes, uint256 amount) external payable returns (bytes32 messageId) {
        if (amount < MIN_BET) revert BetTooSmall();
        betToken.safeTransferFrom(msg.sender, address(this), amount);

        Client.EVM2AnyMessage memory m = _buildMessage(Action.Bet, marketId, msg.sender, yes, amount);
        uint256 fee = _checkFee(m);

        betToken.forceApprove(address(router), amount);
        messageId = router.ccipSend{value: fee}(hubChainSelector, m);
        emit BetSent(messageId, marketId, msg.sender, yes, amount, fee);
        _refundExcess(fee);
    }

    /// @notice Ask the hub to pay out your winnings for `marketId` back to this chain.
    function claim(uint256 marketId) external payable returns (bytes32 messageId) {
        Client.EVM2AnyMessage memory m = _buildMessage(Action.Claim, marketId, msg.sender, false, 0);
        uint256 fee = _checkFee(m);
        messageId = router.ccipSend{value: fee}(hubChainSelector, m);
        emit ClaimSent(messageId, marketId, msg.sender, fee);
        _refundExcess(fee);
    }

    // ---------------------------------------------------------------- quotes
    function quoteBet(uint256 marketId, bool yes, uint256 amount) external view returns (uint256) {
        return router.getFee(hubChainSelector, _buildMessage(Action.Bet, marketId, msg.sender, yes, amount));
    }

    function quoteClaim(uint256 marketId) external view returns (uint256) {
        return router.getFee(hubChainSelector, _buildMessage(Action.Claim, marketId, msg.sender, false, 0));
    }

    // ---------------------------------------------------------------- internals
    function _buildMessage(Action action, uint256 marketId, address user, bool yes, uint256 amount)
        internal
        view
        returns (Client.EVM2AnyMessage memory)
    {
        Client.EVMTokenAmount[] memory tokens;
        if (amount > 0) {
            tokens = new Client.EVMTokenAmount[](1);
            tokens[0] = Client.EVMTokenAmount({token: address(betToken), amount: amount});
        } else {
            tokens = new Client.EVMTokenAmount[](0);
        }
        return Client.EVM2AnyMessage({
            receiver: abi.encode(hub),
            data: abi.encode(action, marketId, user, yes),
            tokenAmounts: tokens,
            feeToken: address(0), // pay in native
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: HUB_GAS_LIMIT, allowOutOfOrderExecution: true})
            )
        });
    }

    function _checkFee(Client.EVM2AnyMessage memory m) internal view returns (uint256 fee) {
        fee = router.getFee(hubChainSelector, m);
        if (msg.value < fee) revert InsufficientFee(msg.value, fee);
    }

    function _refundExcess(uint256 fee) internal {
        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess}("");
            if (!ok) revert RefundFailed();
        }
    }
}
