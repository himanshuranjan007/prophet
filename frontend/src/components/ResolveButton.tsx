"use client";

import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, Outcome, type Market } from "@/lib/config";
import { hubAbi } from "@/lib/abi";
import { useAction } from "@/lib/useAction";
import { CrystalBall } from "./Doodles";
import { ActionError } from "./ui";

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
      step("Switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      step("Confirm in your wallet…");
      const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "resolve", args: [marketId, roundId], chainId: HUB_CHAIN.id });
      step("Settling on Base…");
      await waitForTransactionReceipt(config, { hash: h, chainId: HUB_CHAIN.id });
      onDone?.();
    });

  return (
    <section className="card-primary space-y-4 p-6">
      <div className="flex items-start gap-4">
        <CrystalBall className={`h-10 w-10 shrink-0 ${action.busy ? "wiggle" : ""}`} />
        <div className="min-w-0">
          <h2 className="font-display text-head">Time&apos;s up</h2>
          <p className="mt-1 text-sm text-muted">
            {oneSided ? (
              "Only one side has bets, so the market settles as void and everyone is refunded."
            ) : ready ? (
              <>
                Settles on Chainlink round <span className="num">{(roundId & ((1n << 64n) - 1n)).toString()}</span>, the first price after
                close.
              </>
            ) : (
              <>
                Waiting for Chainlink to publish its first price after close. This usually takes up to{" "}
                <span className="num">20 minutes</span>.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <button type="button" className="btn-primary w-full py-3 text-base whitespace-normal" disabled={!ready || !isConnected || action.busy} aria-busy={action.busy} onClick={resolve}>
          {action.step ?? (isConnected ? "Resolve market" : "Connect a wallet to resolve")}
        </button>
        <p className="text-center text-xs text-muted">
          Anyone can resolve · <span className="num">1</span> transaction on Base
        </p>
      </div>

      <ActionError action={action} />
    </section>
  );
}
