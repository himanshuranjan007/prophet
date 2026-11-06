"use client";

import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, Outcome, type Market } from "@/lib/config";
import { hubAbi } from "@/lib/abi";
import { useAction } from "@/lib/useAction";
import { CrystalBall } from "./Doodles";

/** Anyone can settle a closed market against the first Data Feed round after close. */
export function ResolveButton({ marketId, market, now, onDone }: { marketId: bigint; market: Market; now: number; onDone?: () => void }) {
  const config = useConfig();
  const { chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const action = useAction();
  const closed = now > 0 && now >= Number(market.closeTime);
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
      step("switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      step("confirm in your wallet…");
      const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "resolve", args: [marketId, roundId], chainId: HUB_CHAIN.id });
      step("reading the ball…");
      await waitForTransactionReceipt(config, { hash: h, chainId: HUB_CHAIN.id });
      onDone?.();
    });

  return (
    <div className="card -rotate-[0.6deg] flex flex-wrap items-center justify-between gap-4 bg-hl/25 p-5">
      <div className="flex items-center gap-3">
        <CrystalBall className="wiggle h-12 w-12 shrink-0 text-accent" />
        <div>
          <div className="font-display text-3xl">Time&apos;s up!</div>
          <div className="font-hand text-lg text-muted">
            {oneSided
              ? "only one side showed up, so it settles void and everyone gets refunded."
              : ready
                ? `settles on Chainlink round ${(roundId & ((1n << 64n) - 1n)).toString()}, the first price after close.`
                : "waiting for Chainlink to publish its first price after close…"}
          </div>
        </div>
      </div>
      <button className="btn-primary rotate-1 text-xl" disabled={!ready || !isConnected || action.busy} onClick={resolve}>
        {action.step ?? (isConnected ? "Reveal the answer" : "connect to resolve")}
      </button>
      {action.error && <div className="w-full break-words font-hand text-base text-no">{action.error}</div>}
    </div>
  );
}
