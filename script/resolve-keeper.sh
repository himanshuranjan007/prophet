#!/usr/bin/env bash
# Settles every closed market as soon as it can be settled, which is what a Chainlink CRE / Automation upkeep would do:
#   - one-sided (or empty) market      -> resolve(id, 0)         (void, refunds; needs no price)
#   - feed has a round after close     -> resolve(id, findResolutionRound(id))
#   - still unresolvable after 1 day   -> voidStale(id)          (refunds)
# Everything here is permissionless; this script only pays gas on Base Sepolia.
#
#   bash script/resolve-keeper.sh            # loop every 2 min
#   ONCE=1 bash script/resolve-keeper.sh     # single pass
#
# env (.env): PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, HUB_ADDRESS
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
B=$BASE_SEPOLIA_RPC_URL; HUB=$HUB_ADDRESS
GRACE=86400 # PredictionHub.RESOLVE_GRACE
MARKET='getMarket(uint256)((string,address,int256,uint64,uint256,uint256,uint8,int256))'

send() {
  cast send "$HUB" "$@" --private-key "$PRIVATE_KEY" --rpc-url "$B" --json |
    python3 -I -c "import json,sys; r=json.load(sys.stdin); print(r['transactionHash'], 'ok' if int(r['status'],16) else 'REVERTED')"
}

pass() {
  local n now
  n=$(cast call "$HUB" 'marketCount()(uint256)' --rpc-url "$B" | cut -d' ' -f1)
  now=$(date +%s)
  for ((i = 0; i < n; i++)); do
    # -> "outcome closeTime yesPool noPool"
    read -r outcome close yes no < <(cast call "$HUB" "$MARKET" "$i" --rpc-url "$B" --json |
      python3 -I -c "import json,sys; m=json.load(sys.stdin)[0]; print(m[6], m[3], m[4], m[5])")
    [ "$outcome" = "0" ] && [ "$now" -ge "$close" ] || continue
    if [ "$yes" = "0" ] || [ "$no" = "0" ]; then
      echo "$(date -u +%H:%M:%S) market $i one-sided -> void  $(send 'resolve(uint256,uint80)' "$i" 0)"
      continue
    fi
    round=$(cast call "$HUB" 'findResolutionRound(uint256)(uint80)' "$i" --rpc-url "$B" | cut -d' ' -f1)
    if [ "$round" != "0" ]; then
      echo "$(date -u +%H:%M:%S) market $i resolve with round $round  $(send 'resolve(uint256,uint80)' "$i" "$round")"
    elif [ "$now" -ge $((close + GRACE)) ]; then
      echo "$(date -u +%H:%M:%S) market $i stale -> voidStale  $(send 'voidStale(uint256)' "$i")"
    fi
  done
}

while true; do
  pass || echo "$(date -u +%H:%M:%S) pass failed, retrying next tick"
  [ -n "${ONCE:-}" ] && break
  sleep 120
done
