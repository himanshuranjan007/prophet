"use client";

import Link from "next/link";
import { useState } from "react";
import { NETS, Outcome, ccipExplorerMsg, txUrl, type Market } from "@/lib/config";
import { fmtToken, fmtUsd } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ChainPosition, HistoryItem, PortfolioMarket, PositionStatus } from "@/lib/portfolio";
import { ChainDot } from "../ChainDot";
import { ExternalLink } from "../ui";

const HUB = NETS.find((n) => n.isHub)!;
/** Activity rows shown before "Show all". */
const PAGE = 15;

const RESULT: Record<PositionStatus, { label: string; className: string }> = {
  won: { label: "Won", className: "text-yes" },
  lost: { label: "Lost", className: "text-no" },
  refunded: { label: "Refunded", className: "text-muted" },
  claim: { label: "Claim", className: "text-ink" },
  paying: { label: "Paying", className: "text-ink" },
  open: { label: "Open", className: "text-muted" },
  closed: { label: "Awaiting resolution", className: "text-muted" },
};

const KIND: Record<HistoryItem["kind"], string> = { bet: "Bet", refund: "Refund", claim: "Paid out" };

/**
 * Settled markets (what came back) and a timeline of everything that happened to this wallet's money
 * on the hub. Always renders a card: skeleton while logs load, a calm one-liner when there's nothing.
 */
export function History({
  items,
  settled,
  marketById,
  loading,
  error,
}: {
  items: HistoryItem[];
  settled: PortfolioMarket[];
  marketById: (id: number) => (Market & { id: number }) | undefined;
  loading: boolean;
  error: Error | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasSettled = settled.length > 0;
  const shown = showAll ? items : items.slice(0, PAGE);
  const errorLine = error?.message.split("\n")[0];

  if (!hasSettled && items.length === 0 && !loading && !error) {
    return (
      <section className="card p-6" aria-labelledby="portfolio-history-title">
        <h2 id="portfolio-history-title" className="font-display text-head">
          History
        </h2>
        <p className="mt-2 text-sm text-muted">No history yet.</p>
      </section>
    );
  }

  // with settled markets above, an empty activity list adds nothing
  const showActivity = !hasSettled || loading || !!error || items.length > 0;

  return (
    <section className="card p-6" aria-labelledby="portfolio-history-title">
      {hasSettled && (
        <>
          <h2 id="portfolio-history-title" className="font-display text-head">
            Settled
          </h2>
          <ul className="mt-2 divide-y divide-dashed divide-line">
            {settled.map((p) => (
              <SettledRow key={p.id} p={p} />
            ))}
          </ul>
        </>
      )}

      {showActivity && (
        <div className={hasSettled ? "mt-8" : undefined}>
          {hasSettled ? (
            <h3 className="eyebrow">Activity</h3>
          ) : (
            <h2 id="portfolio-history-title" className="font-display text-head">
              History
            </h2>
          )}

          {loading && items.length === 0 ? (
            <div className="mt-4 space-y-3" role="status" aria-label="Loading history">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-6" />
              ))}
            </div>
          ) : error && items.length === 0 ? (
            <div className="mt-4 space-y-1" role="alert">
              <p className="text-sm text-no">Couldn&apos;t load history</p>
              {errorLine && <p className="break-words text-sm text-muted">{errorLine}</p>}
            </div>
          ) : (
            <>
              {error && (
                <p className="mt-2 break-words text-sm text-muted" role="alert">
                  Couldn&apos;t refresh history{errorLine ? `: ${errorLine}` : "."}
                </p>
              )}
              <ul className={`${hasSettled ? "mt-1" : "mt-2"} divide-y divide-dashed divide-line`}>
                {shown.map((i) => (
                  <ActivityRow
                    key={`${i.txHash}:${i.kind}:${i.marketId}:${i.net.chain.id}:${i.amount}`}
                    item={i}
                    market={marketById(i.marketId)}
                  />
                ))}
              </ul>
              {items.length > PAGE && (
                <button type="button" className="btn-quiet mt-2 -ml-2" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? (
                    "Show fewer"
                  ) : (
                    <>
                      Show all (<span className="num">{items.length}</span>)
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** The side that pays on this market's outcome (a void market refunds both). */
const winningStake = (m: Market, c: ChainPosition) =>
  m.outcome === Outcome.Yes ? c.yes : m.outcome === Outcome.No ? c.no : c.yes + c.no;

function SettledRow({ p }: { p: PortfolioMarket }) {
  const r = RESULT[p.status];
  const returned = p.paid + p.claimable;
  const delta = returned - p.staked;
  // paid amounts come from the hub's Claimed logs: until they're scanned, a paid-out position would read as 0
  const awaitingLogs = p.chains.some((c) => c.claimed && c.paid === 0n && winningStake(p.market, c) > 0n);

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/market/${p.id}`}
          className="min-w-0 break-words font-display text-[1.25rem] leading-snug underline-offset-4 hover:underline"
        >
          {p.market.question}
        </Link>
        <span className={`shrink-0 pt-1 text-sm font-semibold ${r.className}`}>{r.label}</span>
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">
          staked <span className="num">{fmtToken(p.staked)}</span> <span aria-hidden>→</span>
          <span className="sr-only">,</span> returned{" "}
          {awaitingLogs ? <span title="Loading payouts">…</span> : <span className="num">{fmtToken(returned)}</span>} BnM
        </span>
        {!awaitingLogs && <Delta value={delta} />}
        {p.market.finalPrice > 0n && (
          <span className="text-muted">
            settled at <span className="num">{fmtUsd(p.market.finalPrice)}</span>
          </span>
        )}
      </p>
    </li>
  );
}

function Delta({ value }: { value: bigint }) {
  if (value === 0n) return <span className="num text-muted">±0 BnM</span>;
  const up = value > 0n;
  return (
    <span className={`num font-semibold ${up ? "text-yes" : "text-no"}`}>
      {up ? "+" : "−"}
      {fmtToken(up ? value : -value)} BnM
    </span>
  );
}

function ActivityRow({ item: i, market }: { item: HistoryItem; market?: Market }) {
  const label = KIND[i.kind];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[4.25rem] text-sm font-semibold">{label}</span>
        <ChainDot net={i.net} />
        {i.kind === "bet" ? (
          <span className={`num font-semibold ${i.yes ? "text-yes" : "text-no"}`}>
            {fmtToken(i.amount)} BnM {i.yes ? "YES" : "NO"}
          </span>
        ) : (
          <span className="num font-semibold">{fmtToken(i.amount)} BnM</span>
        )}
        <span className="num ml-auto text-sm text-muted">
          {i.at !== undefined ? <Ago at={i.at} /> : `block ${i.blockNumber.toString()}`}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-x-3 text-sm">
        <Link
          href={`/market/${i.marketId}`}
          className="min-w-0 flex-1 truncate text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {market?.question ?? `Market #${i.marketId}`}
        </Link>
        <ExternalLink href={txUrl(HUB, i.txHash)} title={`Transaction on ${HUB.name}`}>
          tx
          <span className="sr-only">
            {" "}
            for this {label.toLowerCase()} on {HUB.short}
          </span>
        </ExternalLink>
        {i.messageId && (
          <ExternalLink href={ccipExplorerMsg(i.messageId)} title="Message on the CCIP Explorer">
            CCIP
            <span className="sr-only"> message for this {label.toLowerCase()}</span>
          </ExternalLink>
        )}
      </div>
    </li>
  );
}

/** "3h ago", with the local time on hover. Subscribes to the shared clock so only this text re-renders. */
function Ago({ at }: { at: number }) {
  const now = useNow();
  if (now === 0) return null; // before hydration
  const d = new Date(at * 1000);
  return (
    <time dateTime={d.toISOString()} title={d.toLocaleString()}>
      {ago(Math.max(0, now - at))}
    </time>
  );
}

function ago(s: number) {
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
