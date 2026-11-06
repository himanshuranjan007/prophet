"use client";

import { NETS, ccipExplorerMsg, type Market, type Net } from "@/lib/config";
import type { Trip } from "@/lib/portfolio";
import { ChainDot } from "../ChainDot";
import { IconPlane, IconReturn } from "../Doodles";
import { ExternalLink } from "../ui";
import { QuestionLine, Stake, Tokens } from "./parts";

const HUB = NETS.find((n) => n.isHub)!;
/** Typical CCIP trip (and the payout leg back from Base, which has no per-chain estimate). */
const DEFAULT_ETA_MIN = 25;
/** A bet or claim still crossing after this long is slower than usual. */
const SLOW_SEC = 45 * 60;

/** "~25 min" -> 25 */
const etaMin = (n: Net) => Number(/\d+/.exec(n.eta)?.[0]) || DEFAULT_ETA_MIN;

function sentAgo(s: number) {
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

const KIND_LABEL: Record<Trip["kind"], string> = {
  bet: "bet",
  claim: "claim",
  payout: "payout",
  refund: "refund",
};

/**
 * CCIP trips still in the air for this wallet: bets and claims heading to the pool on Base, payouts and
 * refunds heading back to a spoke. Renders nothing when there are none (the Summary shows the logs
 * loading state).
 */
export function InFlight({
  trips,
  marketById,
  now,
}: {
  trips: Trip[];
  marketById: (id: number) => (Market & { id: number }) | undefined;
  now: number;
  logsLoading: boolean;
}) {
  if (trips.length === 0) return null;

  return (
    <section className="card p-6" aria-labelledby="portfolio-inflight-title">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="portfolio-inflight-title" className="font-display text-head">
          Crossing chains
        </h2>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <span className="status-dot shrink-0" aria-hidden />
          via Chainlink CCIP
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Bets travel to the pool on Base and winnings travel back. Each trip waits for the source chain to finalize.
      </p>
      <ul className="mt-2 divide-y divide-dashed divide-line">
        {trips.map((t) => (
          <TripRow key={`${t.kind}:${t.messageId}`} trip={t} market={marketById(t.marketId)} now={now} />
        ))}
      </ul>
    </section>
  );
}

function TripRow({ trip: t, market, now }: { trip: Trip; market?: Market; now: number }) {
  const outbound = t.kind === "bet" || t.kind === "claim";
  const etaSec = (outbound ? etaMin(t.net) : DEFAULT_ETA_MIN) * 60;
  // now is 0 before hydration and `at` may not be fetched yet: then there's no elapsed time to show
  const elapsed = now > 0 && t.at !== undefined ? Math.max(0, now - t.at) : undefined;
  const slow = outbound && elapsed !== undefined && elapsed > SLOW_SEC;
  const progress = elapsed === undefined ? 0 : Math.min(1, elapsed / etaSec);

  const meta = [
    elapsed !== undefined && `Sent ${sentAgo(elapsed)}`,
    outbound && (elapsed === undefined ? `Usually ${t.net.eta}` : `usually ${t.net.eta}`),
    slow && "taking longer than usual",
  ].filter(Boolean) as string[];

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 py-3">
      <span className="pt-1">
        {t.kind === "refund" ? <IconReturn className="h-4 w-4" /> : <IconPlane className="wiggle h-4 w-4" />}
      </span>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Route trip={t} />
        </p>
        <div className="mt-1">
          <QuestionLine id={t.marketId} question={market?.question} />
        </div>
        {meta.length > 0 && <p className="num mt-1 text-sm text-muted">{meta.join(" · ")}</p>}
        {elapsed !== undefined && (
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
            <div
              className="h-full bg-ink transition-[width] duration-(--dur-slow) ease-(--ease-out) motion-reduce:transition-none"
              style={{ width: `${(progress * 100).toFixed(2)}%` }}
            />
          </div>
        )}
      </div>

      <ExternalLink href={ccipExplorerMsg(t.messageId)} title="Follow this message on the CCIP Explorer" className="pt-0.5 text-sm">
        Track
        <span className="sr-only"> this {KIND_LABEL[t.kind]} on the CCIP Explorer</span>
      </ExternalLink>
    </li>
  );
}

/** "Bet 1.5 YES from Arbitrum -> Base", "Winnings 2 BnM -> Ethereum", ... */
function Route({ trip: t }: { trip: Trip }) {
  const arrow = (
    <>
      <span aria-hidden>→</span>
      <span className="sr-only">to</span>
    </>
  );
  const amount = t.amount !== undefined && <Tokens amount={t.amount} />;

  switch (t.kind) {
    case "bet":
      return (
        <>
          <span>Bet</span>
          {t.amount !== undefined && <Stake amount={t.amount} yes={!!t.yes} />}
          <span>from</span>
          <ChainDot net={t.net} />
          {arrow}
          <ChainDot net={HUB} />
        </>
      );
    case "claim":
      return (
        <>
          <span>Claim from</span>
          <ChainDot net={t.net} />
          {arrow}
          <ChainDot net={HUB} />
        </>
      );
    case "payout":
      return (
        <>
          <span>Winnings</span>
          {amount}
          {arrow}
          <ChainDot net={t.net} />
        </>
      );
    case "refund":
      return (
        <>
          <span>Refund</span>
          {amount}
          {arrow}
          <ChainDot net={t.net} />
        </>
      );
  }
}
