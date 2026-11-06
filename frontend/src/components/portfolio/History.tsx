"use client";

import { useState, type ReactNode } from "react";
import { NETS, Outcome, ccipExplorerMsg, txUrl, type Market } from "@/lib/config";
import { fmtToken, fmtUsd } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ChainPosition, HistoryItem, PortfolioMarket, PositionStatus } from "@/lib/portfolio";
import { ChainDot } from "../ChainDot";
import { IconCheck, IconPlane, IconReturn } from "../Doodles";
import { ExternalLink, StatusLabel } from "../ui";
import { QuestionLine, QuestionTitle, Stake, Tokens } from "./parts";

const HUB = NETS.find((n) => n.isHub)!;
/** Activity rows shown before "Show all". */
const PAGE = 15;

/** This wallet's result on a settled market. Ink only: yes/no colours belong to the YES/NO words. */
function result(p: PortfolioMarket): { label: string; icon?: ReactNode; muted?: boolean } {
  const refund = p.market.outcome === Outcome.Invalid;
  const icon = "h-4 w-4 shrink-0";
  const map: Record<PositionStatus, { label: string; icon?: ReactNode; muted?: boolean }> = {
    won: { label: "Won", icon: <IconCheck className={icon} /> },
    lost: { label: "Lost", muted: true },
    refunded: { label: "Refunded", icon: <IconReturn className={icon} />, muted: true },
    claim: { label: refund ? "Refund to claim" : "Ready to claim" },
    paying: { label: refund ? "Refund on its way" : "Payout on its way", icon: <IconPlane className={`wiggle ${icon}`} /> },
    // not expected in `settled`, kept so every status has a label
    open: { label: "Open", muted: true },
    closed: { label: "Awaiting resolution", muted: true },
  };
  return map[p.status];
}

const KIND: Record<HistoryItem["kind"], string> = { bet: "Bet", refund: "Refund", claim: "Paid out" };

/**
 * Two cards: "Settled positions" (what came back from each resolved market; nothing when there are none)
 * and "Activity" (every bet, refund and payout of this wallet on the hub; always renders, with a
 * skeleton while logs load, an error line, or a calm one-liner when empty).
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
  const shown = showAll ? items : items.slice(0, PAGE);
  const errorLine = error?.message.split("\n")[0];

  return (
    <>
      {settled.length > 0 && (
        <section className="card p-6" aria-labelledby="portfolio-settled-title">
          <h2 id="portfolio-settled-title" className="font-display text-head">
            Settled positions
          </h2>
          <ul className="mt-2 divide-y divide-dashed divide-line">
            {settled.map((p) => (
              <SettledRow key={p.id} p={p} />
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6" aria-labelledby="portfolio-activity-title">
        <h2 id="portfolio-activity-title" className="font-display text-head">
          Activity
        </h2>
        <p className="mt-1 text-sm text-muted">Every bet, refund and payout recorded by the pool on Base, newest first.</p>

        {loading && items.length === 0 ? (
          <div className="mt-4 space-y-3" role="status" aria-label="Loading activity">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-6" />
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <div className="mt-4 space-y-1" role="alert">
            <p className="text-sm text-no">Couldn&apos;t load activity.</p>
            {errorLine && <p className="break-words text-sm text-muted">{errorLine}</p>}
          </div>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No activity yet.</p>
        ) : (
          <>
            {error && (
              <p className="mt-2 break-words text-sm text-muted" role="alert">
                Couldn&apos;t refresh activity{errorLine ? `: ${errorLine}` : "."}
              </p>
            )}
            <ul className="mt-2 divide-y divide-dashed divide-line">
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
      </section>
    </>
  );
}

/** The side that pays on this market's outcome (a void market refunds both). */
const winningStake = (m: Market, c: ChainPosition) =>
  m.outcome === Outcome.Yes ? c.yes : m.outcome === Outcome.No ? c.no : c.yes + c.no;

function SettledRow({ p }: { p: PortfolioMarket }) {
  const r = result(p);
  const returned = p.paid + p.claimable;
  const delta = returned - p.staked;
  // paid amounts come from the hub's Claimed logs: until they're scanned, a paid-out position would read as 0
  const awaitingLogs = p.chains.some((c) => c.claimed && c.paid === 0n && winningStake(p.market, c) > 0n);

  return (
    <li className="space-y-1.5 py-4">
      <div className="flex items-start justify-between gap-4">
        <QuestionTitle id={p.id} question={p.market.question} />
        <span className={`inline-flex shrink-0 items-center gap-1.5 pt-1 text-sm font-semibold ${r.muted ? "text-muted" : "text-ink"}`}>
          {r.icon}
          {r.label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {/* settled markets are resolved, so the label never depends on the clock */}
        <StatusLabel market={p.market} now={0} />
        {p.market.finalPrice > 0n && (
          <span className="text-muted">
            at <span className="num">{fmtUsd(p.market.finalPrice)}</span>
          </span>
        )}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-muted">
          staked <span className="num">{fmtToken(p.staked)}</span> <span aria-hidden>→</span>
          <span className="sr-only">,</span> returned{" "}
          {awaitingLogs ? <span title="Loading payouts">…</span> : <span className="num">{fmtToken(returned)}</span>} BnM
        </span>
        {!awaitingLogs && <Delta value={delta} />}
      </p>
    </li>
  );
}

/** Signed result in ink (the sign carries it; yes/no colours stay on the YES/NO words). */
function Delta({ value }: { value: bigint }) {
  const abs = value < 0n ? -value : value;
  if (fmtToken(abs) === "0") return <span className="num text-muted">±0 BnM</span>;
  return (
    <span className="num font-semibold">
      {value > 0n ? "+" : "−"}
      {fmtToken(abs)} BnM
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
        {i.kind === "bet" ? <Stake amount={i.amount} yes={!!i.yes} /> : <Tokens amount={i.amount} />}
        <span className="num ml-auto text-sm text-muted">
          {i.at !== undefined ? <Ago at={i.at} /> : `block ${i.blockNumber.toString()}`}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-x-3 text-sm">
        <div className="min-w-0 flex-1">
          <QuestionLine id={i.marketId} question={market?.question} />
        </div>
        {i.messageId ? (
          <ExternalLink href={ccipExplorerMsg(i.messageId)} title="Message on the CCIP Explorer">
            via CCIP
            <span className="sr-only">: this {label.toLowerCase()} on the CCIP Explorer</span>
          </ExternalLink>
        ) : (
          <ExternalLink href={txUrl(HUB, i.txHash)} title={`Transaction on ${HUB.name}`}>
            on {HUB.short}
            <span className="sr-only">: this {label.toLowerCase()} on the block explorer</span>
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
