# Prophet: hackathon submission text

Paste-ready answers for the submission form. Each section maps to a common form field. Before submitting, replace the two placeholders (app URL, video).

---

**Project name:** Prophet

**Tagline:** Price prediction markets with one shared pool on Base. Bet from any chain over Chainlink CCIP, and get paid back on that chain.

**Links**
- Live app: _add the Vercel production URL_
- Code: https://github.com/himanshuranjan007/prophet
- Demo video: _add link_

---

### What it does

Prophet is a parimutuel prediction market for crypto prices ("Will BTC be above $77,000 on Nov 10, 00:00 UTC?").
- Every market has **one pool on Base Sepolia**, and anyone can bet into it from **Base, Arbitrum Sepolia or Ethereum Sepolia**.
- A bet from another chain is a single **CCIP programmable token transfer**: the stake and the bet travel together, and the hub records the position on arrival.
- At close, anyone can settle the market against a **Chainlink Data Feed**, using the first round published at or after the close time.
- Winners claim on the chain they bet from. For bets from Arbitrum or Ethereum Sepolia, the hub sends the payout back to that chain over CCIP.
- SOL/USD isn't available on Base Sepolia, so Prophet **relays the Chainlink SOL/USD feed from Arbitrum to Base over CCIP** into an ordered on-chain mirror that the hub reads like any other feed.

### How we used Chainlink

**Hard requirement:** each cross-chain bet is a CCIP programmable token transfer, and the hub's `_ccipReceive` writes the position. A claim triggers a second CCIP transfer that pays out.

- **CCIP (state-changing, in contracts):**
  - **Bets:** `PredictionSpoke` sends each bet as token + data.
  - **Hub receive:** `PredictionHub._ccipReceive` checks the source chain and sender, records the position, or processes a claim. Late or invalid bets are refunded over CCIP.
  - **Return trip:** `PredictionHub._sendTokens` sends payouts and refunds back to the user's chain, with the fee paid in LINK.
  - **Price relay:** `FeedRelayer` and `RelayedFeed` carry Chainlink price rounds across chains. The relay uses out-of-order execution, so CCIP gives no ordering guarantee; the mirror enforces order itself.
- **Data Feeds:**
  - **Settlement:** ETH/USD and BTC/USD on Base, and SOL/USD relayed from Arbitrum, settle every market. `resolve` only accepts the first round at or after close, so nobody can choose the price.
  - **Charts:** the app draws its live charts straight from feed rounds.

Code links:
- **CCIP send:** [PredictionSpoke.sol#L48](https://github.com/himanshuranjan007/prophet/blob/main/src/PredictionSpoke.sol#L48)
- **CCIP receive:** [PredictionHub.sol#L197](https://github.com/himanshuranjan007/prophet/blob/main/src/PredictionHub.sol#L197)
- **CCIP payout:** [PredictionHub.sol#L234](https://github.com/himanshuranjan007/prophet/blob/main/src/PredictionHub.sol#L234)
- **Data Feed settlement:** [PredictionHub.sol#L153](https://github.com/himanshuranjan007/prophet/blob/main/src/PredictionHub.sol#L153)
- **Feed relay:** [FeedRelayer.sol#L64](https://github.com/himanshuranjan007/prophet/blob/main/src/FeedRelayer.sol#L64) and [RelayedFeed.sol#L64](https://github.com/himanshuranjan007/prophet/blob/main/src/RelayedFeed.sol#L64)

### How we built it

- **Contracts:** Solidity with Foundry, on `@chainlink/contracts-ccip` 2.0. 28 unit tests use the CCIP local simulator; fork tests run against Base Sepolia.
- **Network:** a hub on Base Sepolia, spokes on Arbitrum and Ethereum Sepolia, and CCIP-BnM as the bet token.
- **Frontend:** Next.js 16, wagmi and viem, with no backend or indexer.
  - **State:** read from the contracts.
  - **History and in-flight trips:** read from on-chain event logs across all three chains.
  - **Positions page:** shows a wallet's whole footprint, whichever chain the wallet is on.

### Challenges

- **CCIP gives no ordering guarantee for out-of-order messages.** Relayed price rounds can arrive out of order, so `RelayedFeed` holds early rounds and appends them strictly in sequence.
- **Relaying only the latest price round was exploitable.** Someone could skip a round that settles a market against them. The ordered relay closes that gap, and there's a test for the attack.
- **A reverting CCIP receive strands tokens until manual execution.** The hub doesn't revert on a trusted spoke's message as long as it holds LINK for the return fee: bad bets are refunded and empty claims are ignored with an event.
- **Testnet CCIP waits for finality (about 20–25 minutes per leg).** The app tracks in-flight bets and claims and links each one to the CCIP Explorer.

### Proven on testnet

- [Bet Arbitrum → Base](https://ccip.chain.link/tx/0xb49e6d3bb02ad94bd02ebeca1a524e9cc08a55b62f6dd41492949da81c9084ed)
- [Bet Ethereum Sepolia → Base](https://ccip.chain.link/tx/0xb3d41bdfd55c63a80c6e36c1f8a7846f0836458d19af1d5da7ce13a2d321bf32)
- [Market settled on Chainlink ETH/USD](https://sepolia.basescan.org/tx/0x027cf437b6d530cdfeb8c883f7157bd765e3e4e3f954158cb192c6a4757e5e50)
- [Payout Base → Arbitrum](https://ccip.chain.link/msg/0x7624fb6869ac3d9973b3db70d55458add876c984438d33833976150fb6fe7512)
- [Refund Base → Ethereum Sepolia](https://ccip.chain.link/msg/0x7c375e9b67040b8023f160d882dbae20488e3d7af4c3e5f6020dc845c3dd833b)
- [SOL price relay Arbitrum → Base](https://ccip.chain.link/tx/0x7c4290c8a9176bd3517feecaf9518b8fe4a13803a932c2484123b6f6646fcbbc)

### What's next

- Run market resolution and the SOL relay as Chainlink CRE workflows instead of local keeper scripts.
- More market types.
- Mainnet with a real stable bet token.
