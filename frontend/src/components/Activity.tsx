"use client";

import { NETS, ccipExplorerMsg, netBySelector, txUrl } from "@/lib/config";
import { fmtToken, shortAddr } from "@/lib/format";
import { useBetLogs } from "@/lib/hooks";
import { ChainDot } from "./ChainDot";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function Activity({ marketId }: { marketId: bigint }) {
  const { data, isLoading, error } = useBetLogs(marketId);

  const byChain = NETS.map((n) => ({
    n,
    total: (data ?? []).filter((l) => l.chainSelector === n.positionSelector).reduce((a, l) => a + l.amount, 0n),
  }));

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Activity</span>
        <span className="flex gap-3">
          {byChain.map(({ n, total }) => (
            <span key={n.chain.id} className="flex items-center gap-1 text-xs text-muted">
              <ChainDot net={n} label={false} />
              {fmtToken(total, 2)}
            </span>
          ))}
        </span>
      </div>
      {isLoading && <div className="text-xs text-muted">Loading bets…</div>}
      {error && <div className="text-xs text-no">Could not load activity</div>}
      {data && data.length === 0 && <div className="text-xs text-muted">No bets yet. Be the first.</div>}
      <ul className="divide-y divide-line">
        {(data ?? []).slice(0, 25).map((l) => {
          const n = netBySelector(l.chainSelector);
          const cross = l.ccipMessageId !== ZERO;
          return (
            <li key={l.txHash + l.user + l.amount} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="flex items-center gap-2">
                {n && <ChainDot net={n} />}
                <span className="font-mono text-xs text-muted">{shortAddr(l.user)}</span>
                <span className={l.yes ? "text-yes" : "text-no"}>
                  {fmtToken(l.amount)} {l.yes ? "YES" : "NO"}
                </span>
              </span>
              {cross ? (
                <a className="text-xs text-accent underline" href={ccipExplorerMsg(l.ccipMessageId)} target="_blank" rel="noreferrer">
                  via CCIP ↗
                </a>
              ) : (
                <a className="text-xs text-muted underline" href={txUrl(NETS[0], l.txHash)} target="_blank" rel="noreferrer">
                  on Base ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
