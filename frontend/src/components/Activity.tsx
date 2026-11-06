"use client";

import { NETS, ccipExplorerMsg, netBySelector, txUrl } from "@/lib/config";
import { fmtToken, shortAddr } from "@/lib/format";
import { useBetLogs } from "@/lib/hooks";
import { ChainDot } from "./ChainDot";
import { ExternalLink } from "./ui";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Ledger of every bet on this market. */
export function Activity({ marketId }: { marketId: bigint }) {
  const { data, isLoading, error } = useBetLogs(marketId);

  const byChain = NETS.map((n) => ({
    n,
    total: (data ?? []).filter((l) => l.chainSelector === n.positionSelector).reduce((a, l) => a + l.amount, 0n),
  }));

  return (
    <section className="card p-6">
      <h2 className="font-display text-head">Activity</h2>
      {data && data.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {byChain.map(({ n, total }) => (
            <span key={n.chain.id} className="inline-flex items-center gap-1.5">
              <ChainDot net={n} />
              <span className="num">{fmtToken(total, 2)}</span>
            </span>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="mt-4 space-y-3" role="status" aria-label="Loading activity">
          <div className="skeleton h-6" />
          <div className="skeleton h-6" />
          <div className="skeleton h-6" />
        </div>
      )}
      {error && <p className="mt-4 text-sm text-no">Couldn&apos;t load activity.</p>}
      {data && data.length === 0 && <p className="mt-4 text-sm text-muted">No bets yet.</p>}
      {data && data.length > 0 && (
        <ul className="mt-2 divide-y divide-dashed divide-line">
          {data.slice(0, 25).map((l, i) => {
            const n = netBySelector(l.chainSelector);
            const cross = l.ccipMessageId !== ZERO;
            return (
              <li key={l.txHash + l.ccipMessageId + i} className="flex items-center justify-between gap-3 py-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  {n && (
                    <span title={n.short} className="inline-flex">
                      <ChainDot net={n} label={false} />
                      <span className="sr-only">{n.short}</span>
                    </span>
                  )}
                  <span className="font-mono text-[0.8rem] text-muted">{shortAddr(l.user)}</span>
                  <span className={`num font-semibold ${l.yes ? "text-yes" : "text-no"}`}>
                    {fmtToken(l.amount)} {l.yes ? "YES" : "NO"}
                  </span>
                </span>
                {cross ? (
                  <ExternalLink href={ccipExplorerMsg(l.ccipMessageId)} title={n ? `Sent from ${n.short} via Chainlink CCIP` : undefined} className="text-sm">
                    via CCIP
                  </ExternalLink>
                ) : (
                  <ExternalLink href={txUrl(NETS[0], l.txHash)} className="text-sm text-muted">
                    on Base
                  </ExternalLink>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
