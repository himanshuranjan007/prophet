"use client";

import { useState } from "react";
import { parseEventLogs } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, type Net } from "./config";
import { hubAbi, spokeAbi } from "./abi";
import { usePending } from "./hooks";
import { useAction } from "./useAction";

/**
 * Claim winnings / refunds for one market position on one chain. Shared by the market page and the
 * portfolio. Hub positions claim on Base directly; spoke positions send a CCIP claim from that spoke
 * (the payout flies back to the same chain). Spoke claims are recorded in the pending store so the
 * button can't be pressed twice (a second claim would just burn another CCIP fee).
 */
export function useClaim() {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const pending = usePending();
  const action = useAction();
  /** "<marketId>:<chainId>" of the claim running now, so only that button shows step text */
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const claim = (marketId: bigint, n: Net) => {
    setBusyKey(`${marketId}:${n.chain.id}`);
    return action.run(async (step) => {
      if (!address) throw new Error("Connect a wallet first");
      step(`Switching to ${n.short}…`);
      if (chainId !== n.chain.id) await switchChainAsync({ chainId: n.chain.id });
      if (n.isHub) {
        step("Confirm your claim…");
        const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "claim", args: [marketId], chainId: n.chain.id });
        step("Paying out…");
        await waitForTransactionReceipt(config, { hash: h, chainId: n.chain.id });
      } else {
        step("Quoting the CCIP fee…");
        const fee = await readContract(config, { address: n.entry, abi: spokeAbi, functionName: "quoteClaim", args: [marketId], chainId: n.chain.id, account: address });
        step("Confirm your claim…");
        const h = await writeContract(config, { address: n.entry, abi: spokeAbi, functionName: "claim", args: [marketId], value: (fee * 12n) / 10n, chainId: n.chain.id });
        step("Sending over CCIP…");
        const r = await waitForTransactionReceipt(config, { hash: h, chainId: n.chain.id });
        const sent = parseEventLogs({ abi: spokeAbi, logs: r.logs, eventName: "ClaimSent" })[0];
        pending.add({ kind: "claim", srcTx: h, msgId: sent?.args.messageId, chainId: n.chain.id, marketId: marketId.toString(), user: address, at: Math.floor(Date.now() / 1000) });
      }
    });
  };

  return {
    claim,
    action,
    /** is the claim for this (market, chain) the one running right now? */
    isBusy: (marketId: bigint | number, n: Net) => action.busy && busyKey === `${marketId}:${n.chain.id}`,
    /** a spoke claim sent from this browser and not yet processed by the hub */
    claimInFlight: (marketId: bigint | number, n: Net) =>
      pending.list.find((p) => p.kind === "claim" && p.marketId === String(marketId) && p.chainId === n.chain.id && p.user === address),
  };
}
