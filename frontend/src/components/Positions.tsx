"use client";

import { useEffect, useState } from "react";
import { parseEventLogs } from "viem";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, NETS, Outcome, ccipExplorerTx, type Market, type Net } from "@/lib/config";
import { hubAbi, spokeAbi } from "@/lib/abi";
import { fmtToken } from "@/lib/format";
import { useBetLogs, usePending } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { ChainDot } from "./ChainDot";
import { IconCheck, IconPlane, IconReturn } from "./Doodles";
import { ActionError, ExternalLink } from "./ui";

/** Minutes after which an un-landed cross-chain bet on a closed market is presumed refunded. */
const REFUND_GRACE_MIN = 45;

function Stake({ amount, yes }: { amount: bigint; yes: boolean }) {
  return (
    <span className={`num font-semibold ${yes ? "text-yes" : "text-no"}`}>
      {fmtToken(amount)} {yes ? "YES" : "NO"}
    </span>
  );
}

function Track({ href }: { href: string }) {
  return (
    <ExternalLink href={href} className="text-sm">
      Track
    </ExternalLink>
  );
}

export function Positions({ marketId, market, now }: { marketId: bigint; market: Market; now: number }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const action = useAction();
  // which row's claim is running, so only that button shows the step text
  const [busyChain, setBusyChain] = useState<number | null>(null);
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

  const claim = (n: Net) => {
    setBusyChain(n.chain.id);
    return action.run(async (step) => {
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
        // persisted, so the button stays hidden (no double fee) until the hub marks it claimed
        pending.add({ kind: "claim", srcTx: h, msgId: sent?.args.messageId, chainId: n.chain.id, marketId: marketId.toString(), user: address!, at: Math.floor(Date.now() / 1000) });
      }
    });
  };

  return (
    <section className="card p-6">
      <h2 className="font-display text-head">Your positions</h2>
      <ul className="mt-2 divide-y divide-dashed divide-line">
        {rows
          .filter((r) => r.pos && (r.pos.yes > 0n || r.pos.no > 0n))
          .map(({ n, pos, claimable }) => {
            const inflight = claimInFlight(n);
            const stepHere = action.busy && busyChain === n.chain.id;
            return (
              <li key={n.chain.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ChainDot net={n} />
                  {pos!.yes > 0n && <Stake amount={pos!.yes} yes />}
                  {pos!.no > 0n && <Stake amount={pos!.no} yes={false} />}
                </div>
                {resolved && (
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
                    {pos!.claimed ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <IconCheck className="h-4 w-4" />
                        Paid
                      </span>
                    ) : inflight ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <IconPlane className="wiggle h-4 w-4" />
                          Payout in flight
                        </span>
                        <Track href={ccipExplorerTx(inflight.srcTx)} />
                      </>
                    ) : claimable === undefined || (reads.isFetching && claimable === 0n) ? (
                      <span className="text-muted">Checking…</span>
                    ) : claimable > 0n ? (
                      <button className="btn-primary text-sm" disabled={action.busy} onClick={() => claim(n)}>
                        {stepHere ? (
                          action.step
                        ) : (
                          <span>
                            Claim <span className="num">{fmtToken(claimable)}</span> on {n.short}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="text-muted">No payout</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}

        {betsInFlight.map((p) => {
          const n = NETS.find((x) => x.chain.id === p.chainId)!;
          const mins = Math.floor((now - p.at) / 60);
          const likelyRefunded = closed && mins > REFUND_GRACE_MIN;
          return (
            <li key={p.srcTx} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 py-3">
              {likelyRefunded ? <IconReturn className="h-4 w-4 text-muted" /> : <IconPlane className="wiggle h-4 w-4" />}
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <ChainDot net={n} />
                <Stake amount={BigInt(p.amount ?? "0")} yes={!!p.yes} />
              </div>
              <div className="justify-self-end">
                <Track href={ccipExplorerTx(p.srcTx)} />
              </div>
              {likelyRefunded ? (
                <>
                  <p className="col-start-2 text-sm text-muted">Landed after close, refunded to {n.short}</p>
                  <button className="btn-quiet justify-self-end" onClick={() => pending.remove(p.srcTx)}>
                    Dismiss
                  </button>
                </>
              ) : (
                <p className="col-span-2 col-start-2 text-sm text-muted">
                  In flight · <span className="num">{mins}m</span> of <span className="num">{n.eta}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <ActionError action={action} className="mt-4" />
      {resolved && mine.some((p) => p.kind === "claim") && (
        <p className="mt-4 text-xs text-muted">
          Cross-chain payouts land in your wallet once the CCIP message executes (<span className="num">~20–25 min</span>).
        </p>
      )}
      {!resolved && closed && <p className="mt-4 text-xs text-muted">Betting is closed. Resolve the market to unlock claims.</p>}
    </section>
  );
}
