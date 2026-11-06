"use client";

import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, Outcome, type Market } from "@/lib/config";
import { hubAbi } from "@/lib/abi";
import { useAction } from "@/lib/useAction";

/** Anyone can settle a closed market against the first Data Feed round after close. */
export function ResolveButton({ marketId, market, now, onDone }: { marketId: bigint; market: Market; now: number; onDone?: () => void }) {
  const config = useConfig();
  const { chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const action = useAction();
  const closed = now >= Number(market.closeTime);
  const oneSided = market.yesPool === 0n || market.noPool === 0n;

  const round = useReadContract({
    address: HUB_ADDRESS,
    abi: hubAbi,
    functionName: "findResolutionRound",
    args: [marketId],
    chainId: HUB_CHAIN.id,
    query: { enabled: closed && market.outcome === Outcome.Unresolved },
  });

  if (!closed || market.outcome !== Outcome.Unresolved) return null;
  const roundId = round.data ?? 0n;
  const ready = oneSided || roundId > 0n;

  const resolve = () =>
    action.run(async (step) => {
      step("Switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      step("Confirm in your wallet…");
      const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "resolve", args: [marketId, roundId], chainId: HUB_CHAIN.id });
      step("Settling…");
      await waitForTransactionReceipt(config, { hash: h, chainId: HUB_CHAIN.id });
      onDone?.();
    });

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="text-sm">
        <div className="font-medium">Market closed</div>
        <div className="text-xs text-muted">
          {oneSided
            ? "Only one side has bets, so it settles as void and everyone gets refunded."
            : ready
              ? `Settles on Chainlink round ${(roundId & ((1n << 64n) - 1n)).toString()}, the first price published after close.`
              : "Waiting for the Chainlink feed to publish its first price after close…"}
        </div>
      </div>
      <button className="btn-primary" disabled={!ready || !isConnected || action.busy} onClick={resolve}>
        {action.step ?? (isConnected ? "Resolve market" : "Connect to resolve")}
      </button>
      {action.error && <div className="w-full break-words text-xs text-no">{action.error}</div>}
    </div>
  );
}
