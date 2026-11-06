#!/usr/bin/env bash
# Relays every new Chainlink SOL/USD round from Arbitrum Sepolia to the RelayedFeed on Base over CCIP,
# in source order, so the mirror never has gaps (a gap would hold resolution until someone backfills it).
# Anyone can run this; it pays the CCIP fee per round (~0.00005 ETH on Arbitrum Sepolia).
#
#   bash script/relay-keeper.sh            # loop every 60s
#   ONCE=1 bash script/relay-keeper.sh     # single pass
#
# env (.env): PRIVATE_KEY, ARBITRUM_SEPOLIA_RPC_URL, BASE_SEPOLIA_RPC_URL, FEED_RELAYER, RELAYED_FEED
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
A=$ARBITRUM_SEPOLIA_RPC_URL; B=$BASE_SEPOLIA_RPC_URL
SOURCE_FEED=$(cast call "$FEED_RELAYER" 'feed()(address)' --rpc-url "$A")

num() { cut -d' ' -f1; }

pass() {
  local latest last next fee
  latest=$(cast call "$SOURCE_FEED" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' --rpc-url "$A" | head -1 | num)
  last=$(cast call "$RELAYED_FEED" 'lastSourceRound()(uint80)' --rpc-url "$B" | num)
  if [ "$last" = "0" ]; then next=$latest; else next=$(python3 -I -c "print($last + 1)"); fi
  # walk forward from the round Base is waiting for, relaying anything not yet sent
  while python3 -I -c "import sys; sys.exit(0 if $next <= $latest else 1)"; do
    if [ "$(cast call "$FEED_RELAYER" 'sent(uint80)(bool)' "$next" --rpc-url "$A")" = "false" ]; then
      fee=$(cast call "$FEED_RELAYER" 'quoteRound(uint80)(uint256)' "$next" --rpc-url "$A" | num)
      tx=$(cast send "$FEED_RELAYER" 'relayRound(uint80)' "$next" --value "$(python3 -I -c "print($fee * 12 // 10)")" \
        --private-key "$PRIVATE_KEY" --rpc-url "$A" --json | python3 -I -c "import json,sys; print(json.load(sys.stdin)['transactionHash'])")
      echo "$(date -u +%H:%M:%S) relayed source round $next  https://ccip.chain.link/tx/$tx"
    fi
    next=$(python3 -I -c "print($next + 1)")
  done
}

while true; do
  pass || echo "$(date -u +%H:%M:%S) pass failed, retrying next tick"
  [ -n "${ONCE:-}" ] && break
  sleep 60
done
