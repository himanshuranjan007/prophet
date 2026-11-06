"use client";

import { useEffect } from "react";
import { parseEventLogs } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, NETS, Outcome, ccipExplorerTx, type Market, type Net } from "@/lib/config";
import { hubAbi, spokeAbi } from "@/lib/abi";
import { fmtToken } from "@/lib/format";
import { useBetLogs, usePending } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { ChainDot } from "./ChainDot";

/** Minutes after which an un-landed cross-chain bet on a closed market is presumed refunded. */
const REFUND_GRACE_MIN = 45;

export function Positions({ marketId, market, now }: { marketId: bigint; market: Market; now: number }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const action = useAction();
  const pending = usePending();
  const logs = useBetLogs(marketId);

  const reads = useReadContracts({
    contracts: address
      ? NETS.flatMap((n) => [
          { address: HUB_ADDRESS, abi: hubAbi, functionName: "getPosition", args: [marketId, address, n.positionSelector], chainId: HUB_CHAIN.id } as const,
          { address: HUB_ADDRESS, abi: hubAbi, functionName: "claimable", args: [marketId, address, n.positionSelector], chainId: HUB_CHAIN.id } as const,
        ])
      : [],
    query: { enabled: !!address },
  });

  const mine = pending.list.filter((p) => p.marketId === marketId.toString() && p.user === address);
  const rows = NETS.map((n, i) => {
    const pos = reads.data?.[i * 2]?.result as { yes: bigint; no: bigint; claimed: boolean } | undefined;
    const claimable = reads.data?.[i * 2 + 1]?.result as bigint | undefined;
    return { n, pos, claimable };
  });

  // Done = bet seen on the hub (matched by CCIP messageId) / claim marked claimed on the hub.
  const landedIds = new Set((logs.data ?? []).map((l) => l.ccipMessageId.toLowerCase()));
  const done = mine
    .filter((p) =>
      p.kind === "bet"
        ? !!p.msgId && landedIds.has(p.msgId.toLowerCase())
        : rows.find((r) => r.n.chain.id === p.chainId)?.pos?.claimed === true,
    )
    .map((p) => p.srcTx)
    .join(",");
  useEffect(() => {
    if (done) done.split(",").forEach((tx) => pending.remove(tx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // outcome just flipped (resolve here or elsewhere): claimable read is stale until refetched
  const outcome = market.outcome;
  useEffect(() => {
    if (address) void reads.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  if (!address) return null;
  const betsInFlight = mine.filter((p) => p.kind === "bet");
  const claimInFlight = (n: Net) => mine.find((p) => p.kind === "claim" && p.chainId === n.chain.id);
  const hasAny = rows.some((r) => r.pos && (r.pos.yes > 0n || r.pos.no > 0n)) || betsInFlight.length > 0;
  if (!hasAny) return null;

  const resolved = market.outcome !== Outcome.Unresolved;
  const closed = now >= Number(market.closeTime);

  const claim = (n: Net) =>
    action.run(async (step) => {
      step(`switching to ${n.short}…`);
      if (chainId !== n.chain.id) await switchChainAsync({ chainId: n.chain.id });
      if (n.isHub) {
        step("confirm your claim…");
        const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "claim", args: [marketId], chainId: n.chain.id });
        await waitForTransactionReceipt(config, { hash: h, chainId: n.chain.id });
      } else {
        step("quoting the CCIP fee…");
        const fee = await readContract(config, { address: n.entry, abi: spokeAbi, functionName: "quoteClaim", args: [marketId], chainId: n.chain.id, account: address });
        step("confirm your claim…");
        const h = await writeContract(config, { address: n.entry, abi: spokeAbi, functionName: "claim", args: [marketId], value: (fee * 12n) / 10n, chainId: n.chain.id });
        const r = await waitForTransactionReceipt(config, { hash: h, chainId: n.chain.id });
        const sent = parseEventLogs({ abi: spokeAbi, logs: r.logs, eventName: "ClaimSent" })[0];
        // persisted, so the button stays hidden (no double fee) until the hub marks it claimed
        pending.add({ kind: "claim", srcTx: h, msgId: sent?.args.messageId, chainId: n.chain.id, marketId: marketId.toString(), user: address!, at: Math.floor(Date.now() / 1000) });
      }
    });

  return (
    <div className="card tilt-r p-5">
      <div className="mb-3 font-display text-3xl">Your calls</div>
      <div className="space-y-2.5">
        {rows
          .filter((r) => r.pos && (r.pos.yes > 0n || r.pos.no > 0n))
          .map(({ n, pos, claimable }) => {
            const inflight = claimInFlight(n);
            return (
              <div key={n.chain.id} className="sketch-alt flex flex-wrap items-center justify-between gap-2 bg-background/60 p-3">
                <div className="flex items-center gap-3 font-hand text-lg">
                  <ChainDot net={n} />
                  {pos!.yes > 0n && <span className="text-yes">{fmtToken(pos!.yes)} YES</span>}
                  {pos!.no > 0n && <span className="text-no">{fmtToken(pos!.no)} NO</span>}
                </div>
                {resolved &&
                  (pos!.claimed ? (
                    <span className="font-hand text-lg text-muted">paid ✔</span>
                  ) : inflight ? (
                    <span className="font-hand text-base text-muted">
                      claim flying back ✈{" "}
                      <a className="text-accent underline" href={ccipExplorerTx(inflight.srcTx)} target="_blank" rel="noreferrer">
                        track
                      </a>
                    </span>
                  ) : claimable === undefined || (reads.isFetching && claimable === 0n) ? (
                    <span className="font-hand text-base text-muted">checking…</span>
                  ) : claimable > 0n ? (
                    <button className="btn-primary -rotate-1" disabled={action.busy} onClick={() => claim(n)}>
                      {action.busy ? action.step : `Claim ${fmtToken(claimable)} on ${n.short}`}
                    </button>
                  ) : (
                    <span className="font-hand text-lg text-muted line-through decoration-no decoration-2">no luck</span>
                  ))}
              </div>
            );
          })}

        {betsInFlight.map((p) => {
          const n = NETS.find((x) => x.chain.id === p.chainId)!;
          const mins = Math.floor((now - p.at) / 60);
          const likelyRefunded = closed && mins > REFUND_GRACE_MIN;
          return (
            <div key={p.srcTx} className="sketch flex flex-wrap items-center justify-between gap-2 border-dashed p-3 font-hand text-lg">
              <div className="flex items-center gap-3">
                <span className={likelyRefunded ? "" : "wiggle inline-block"}>{likelyRefunded ? "↩" : "✈"}</span>
                <ChainDot net={n} />
                <span className={p.yes ? "text-yes" : "text-no"}>
                  {fmtToken(BigInt(p.amount ?? "0"))} {p.yes ? "YES" : "NO"}
                </span>
                <span className="text-base text-muted">
                  {likelyRefunded ? "landed after close, so it was refunded to " + n.short : `in the air · ${mins}m of ${n.eta}`}
                </span>
              </div>
              <span className="flex items-center gap-3 text-base">
                <a className="text-accent underline" href={ccipExplorerTx(p.srcTx)} target="_blank" rel="noreferrer">
                  CCIP Explorer
                </a>
                {likelyRefunded && (
                  <button className="text-muted underline" onClick={() => pending.remove(p.srcTx)}>
                    dismiss
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {action.error && <div className="mt-2 break-words font-hand text-base text-no">{action.error}</div>}
      {resolved && mine.some((p) => p.kind === "claim") && (
        <div className="mt-3 font-hand text-base text-muted">cross-chain payouts land in your wallet once the CCIP message executes (~20–25 min).</div>
      )}
      {!resolved && closed && <div className="mt-3 font-hand text-base text-muted">market&apos;s closed. resolve it to unlock claims.</div>}
    </div>
  );
}
