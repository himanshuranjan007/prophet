"use client";

import { useEffect, useState } from "react";
import { useConfig, useConnection, useReadContracts, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, NETS, Outcome, ccipExplorerTx, type Market, type Net } from "@/lib/config";
import { hubAbi, spokeAbi } from "@/lib/abi";
import { fmtToken } from "@/lib/format";
import { usePending } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { ChainDot } from "./ChainDot";

export function Positions({ marketId, market, now }: { marketId: bigint; market: Market; now: number }) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const action = useAction();
  const pending = usePending();
  const [claimTx, setClaimTx] = useState<Record<number, string>>({});

  const reads = useReadContracts({
    contracts: address
      ? NETS.flatMap((n) => [
          { address: HUB_ADDRESS, abi: hubAbi, functionName: "getPosition", args: [marketId, address, n.positionSelector], chainId: HUB_CHAIN.id } as const,
          { address: HUB_ADDRESS, abi: hubAbi, functionName: "claimable", args: [marketId, address, n.positionSelector], chainId: HUB_CHAIN.id } as const,
        ])
      : [],
    query: { enabled: !!address },
  });

  // in-flight bets for this market & user
  const inflight = pending.list.filter((p) => p.marketId === marketId.toString() && p.user === address);

  const rows = NETS.map((n, i) => {
    const pos = reads.data?.[i * 2]?.result as { yes: bigint; no: bigint; claimed: boolean } | undefined;
    const claimable = (reads.data?.[i * 2 + 1]?.result as bigint | undefined) ?? 0n;
    return { n, pos, claimable };
  });

  // clear in-flight entries once the hub position has grown by the bet amount
  const landed = inflight
    .filter((p) => {
      const row = rows.find((r) => r.n.chain.id === p.chainId);
      return row?.pos && row.pos.yes + row.pos.no >= BigInt(p.baseline) + BigInt(p.amount);
    })
    .map((p) => p.srcTx)
    .join(",");
  useEffect(() => {
    if (landed) landed.split(",").forEach((tx) => pending.remove(tx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  if (!address) return null;

  const hasAny = rows.some((r) => r.pos && (r.pos.yes > 0n || r.pos.no > 0n)) || inflight.length > 0;
  if (!hasAny) return null;

  const claim = (n: Net) =>
    action.run(async (step) => {
      step(`Switching to ${n.short}…`);
      if (chainId !== n.chain.id) await switchChainAsync({ chainId: n.chain.id });
      if (n.isHub) {
        step("Confirm claim in your wallet…");
        const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "claim", args: [marketId], chainId: n.chain.id });
        await waitForTransactionReceipt(config, { hash: h, chainId: n.chain.id });
      } else {
        step("Quoting CCIP fee…");
        const fee = await readContract(config, { address: n.entry, abi: spokeAbi, functionName: "quoteClaim", args: [marketId], chainId: n.chain.id, account: address });
        step("Confirm claim in your wallet…");
        const h = await writeContract(config, {
          address: n.entry,
          abi: spokeAbi,
          functionName: "claim",
          args: [marketId],
          value: (fee * 12n) / 10n,
          chainId: n.chain.id,
        });
        await waitForTransactionReceipt(config, { hash: h, chainId: n.chain.id });
        setClaimTx((m) => ({ ...m, [n.chain.id]: h }));
      }
      await reads.refetch();
    });

  const resolved = market.outcome !== Outcome.Unresolved;

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-medium">Your positions</div>
      <div className="space-y-2">
        {rows
          .filter((r) => r.pos && (r.pos.yes > 0n || r.pos.no > 0n))
          .map(({ n, pos, claimable }) => (
            <div key={n.chain.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background p-2.5 text-sm">
              <div className="flex items-center gap-3">
                <ChainDot net={n} />
                {pos!.yes > 0n && <span className="font-mono text-yes">{fmtToken(pos!.yes)} YES</span>}
                {pos!.no > 0n && <span className="font-mono text-no">{fmtToken(pos!.no)} NO</span>}
              </div>
              {resolved &&
                (pos!.claimed ? (
                  <span className="text-xs text-muted">
                    claimed ✓
                    {claimTx[n.chain.id] && (
                      <>
                        {" "}
                        ·{" "}
                        <a className="text-accent underline" href={ccipExplorerTx(claimTx[n.chain.id])} target="_blank" rel="noreferrer">
                          payout via CCIP ↗
                        </a>
                      </>
                    )}
                  </span>
                ) : claimable > 0n ? (
                  <button className="btn-primary py-1.5" disabled={action.busy} onClick={() => claim(n)}>
                    {action.busy ? action.step : `Claim ${fmtToken(claimable)} on ${n.short}`}
                  </button>
                ) : (
                  <span className="text-xs text-muted">lost</span>
                ))}
            </div>
          ))}
        {inflight.map((p) => {
          const n = NETS.find((x) => x.chain.id === p.chainId)!;
          const mins = Math.floor((now - p.at) / 60);
          return (
            <div key={p.srcTx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-line p-2.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                <ChainDot net={n} />
                <span className={`font-mono ${p.yes ? "text-yes" : "text-no"}`}>
                  {fmtToken(BigInt(p.amount))} {p.yes ? "YES" : "NO"}
                </span>
                <span className="text-xs text-muted">
                  in flight · {mins}m / {n.eta}
                </span>
              </div>
              <a className="text-xs text-accent underline" href={ccipExplorerTx(p.srcTx)} target="_blank" rel="noreferrer">
                CCIP Explorer ↗
              </a>
            </div>
          );
        })}
      </div>
      {action.error && <div className="mt-2 break-words text-xs text-no">{action.error}</div>}
      {resolved && Object.keys(claimTx).length > 0 && (
        <div className="mt-2 text-xs text-muted">
          Cross-chain payouts arrive in your wallet after the CCIP message executes (~20–25 min from Base).
        </div>
      )}
      {!resolved && now >= Number(market.closeTime) && (
        <div className="mt-2 text-xs text-muted">Market closed. Resolve it to unlock claims.</div>
      )}
    </div>
  );
}
