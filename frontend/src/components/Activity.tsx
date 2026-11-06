"use client";

import { NETS, ccipExplorerMsg, netBySelector, txUrl } from "@/lib/config";
import { fmtToken, shortAddr } from "@/lib/format";
import { useBetLogs } from "@/lib/hooks";
import { ChainDot } from "./ChainDot";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Scribbled ledger of every call on this market. */
export function Activity({ marketId }: { marketId: bigint }) {
  const { data, isLoading, error } = useBetLogs(marketId);

  const byChain = NETS.map((n) => ({
    n,
    total: (data ?? []).filter((l) => l.chainSelector === n.positionSelector).reduce((a, l) => a + l.amount, 0n),
  }));

  return (
    <div className="card tilt-l p-5">
      <div className="mb-1 font-display text-3xl">Who called what</div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {byChain.map(({ n, total }) => (
          <span key={n.chain.id} className="flex items-center gap-1 font-hand text-base text-muted">
            <ChainDot net={n} /> {fmtToken(total, 2)}
          </span>
        ))}
      </div>
      {isLoading && <div className="font-hand text-lg text-muted">flipping through the notebook…</div>}
      {error && <div className="font-hand text-lg text-no">couldn&apos;t load the activity</div>}
      {data && data.length === 0 && <div className="font-hand text-lg text-muted">nobody&apos;s called it yet. be first!</div>}
      <ul>
        {(data ?? []).slice(0, 25).map((l, i) => {
          const n = netBySelector(l.chainSelector);
          const cross = l.ccipMessageId !== ZERO;
          return (
            <li
              key={l.txHash + l.ccipMessageId + i}
              className="flex items-center justify-between gap-2 border-b border-dashed border-line py-2 font-hand text-lg last:border-0"
            >
              <span className="flex items-center gap-2.5">
                {n && <ChainDot net={n} label={false} />}
                <span className="font-mono text-sm text-muted">{shortAddr(l.user)}</span>
                <span className={l.yes ? "text-yes" : "text-no"}>
                  {fmtToken(l.amount)} {l.yes ? "YES" : "NO"}
                </span>
              </span>
              {cross ? (
                <a className="text-base text-accent underline" href={ccipExplorerMsg(l.ccipMessageId)} target="_blank" rel="noreferrer">
                  via CCIP from {n?.short} ✈
                </a>
              ) : (
                <a className="text-base text-muted underline" href={txUrl(NETS[0], l.txHash)} target="_blank" rel="noreferrer">
                  on Base
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
