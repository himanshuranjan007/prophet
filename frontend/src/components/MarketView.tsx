"use client";

import Link from "next/link";
import { useConnection } from "wagmi";
import { ASSETS, Outcome, assetByFeed, type Market } from "@/lib/config";
import { countdown, fmtUsd, shortAddr } from "@/lib/format";
import { useAssetPrice, useMarket, useNow } from "@/lib/hooks";
import { Activity } from "./Activity";
import { BetPanel } from "./BetPanel";
import { IconBack, Sparkle } from "./Doodles";
import { PoolBar } from "./PoolBar";
import { PriceChart } from "./PriceChart";
import { RelayStatus } from "./RelayStatus";
import { Positions } from "./Positions";
import { ResolveButton } from "./ResolveButton";
import { ShareChallenge } from "./ShareChallenge";
import { StatusLabel } from "./ui";

/** Two columns on md+: activity on the left, the betting aside (sticky) on the right. */
const GRID = "grid gap-8 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start";
/** On mobile the aside comes first so betting is reachable without scrolling past the activity. */
const ASIDE = "order-first space-y-6 md:order-none md:sticky md:top-24 md:max-h-[calc(100dvh-7rem)] md:overflow-y-auto md:pr-1 md:pb-1";

const hhmm = (t: bigint) => new Date(Number(t) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function MarketView({ id, side, from }: { id: string; side?: "yes" | "no"; from?: string }) {
  const marketId = BigInt(id);
  const { market, isLoading, refetch } = useMarket(marketId);
  const asset = market ? (assetByFeed(market.feed) ?? ASSETS[0]) : undefined;
  const price = useAssetPrice(asset);
  const now = useNow();
  const { address } = useConnection();

  if (isLoading) return <MarketSkeleton />;
  if (!market) return <MarketNotFound />;

  const resolved = market.outcome !== Outcome.Unresolved;
  const isOpen = !resolved && now > 0 && now < Number(market.closeTime);
  const winner = market.outcome === Outcome.Yes ? "YES" : market.outcome === Outcome.No ? "NO" : null;

  const closesAt = hhmm(market.closeTime);
  const when = isOpen
    ? `closes ${closesAt} · in ${countdown(market.closeTime, now)}`
    : !resolved && now === 0
      ? `closes ${closesAt}`
      : `closed ${closesAt}`;

  // the sharer picked the opposite of `side`; no point daring yourself
  const dare = from && side && !resolved && from.toLowerCase() !== address?.toLowerCase() ? { from, side } : null;

  return (
    <div className="space-y-12">
      <div>
        <nav aria-label="Market" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/" className="btn-quiet -ml-2">
            <IconBack className="h-4 w-4" />
            All markets
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <StatusLabel market={market} now={now} />
            <span aria-hidden>·</span>
            <span className="num">{when}</span>
            <span aria-hidden>·</span>
            <span className="num">#{id}</span>
          </div>
        </nav>

        <h1 className="mt-4 max-w-3xl break-words font-display text-title">{market.question}</h1>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          {winner && (
            <span className={`sketch inline-block -rotate-3 px-3 py-0.5 font-display text-head ${winner === "YES" ? "text-yes" : "text-no"}`}>
              {winner} won
            </span>
          )}
          <PriceLine market={market} price={price?.price} symbol={asset!.symbol} />
        </div>

        <div className="mt-8">
          <PriceChart asset={asset!} market={market} now={now} />
        </div>

        {asset!.relay && (
          <div className="mt-4">
            <RelayStatus asset={asset!} now={now} />
          </div>
        )}

        <div className="mt-8">
          <PoolBar market={market} big />
        </div>
      </div>

      <div className="space-y-6">
        {dare && (
          <p className="card flex items-start gap-2.5 p-4 text-sm">
            <Sparkle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-mono text-[0.8rem]">{shortAddr(dare.from)}</span> picked{" "}
              <b className={dare.side === "yes" ? "text-no" : "text-yes"}>{dare.side === "yes" ? "NO" : "YES"}</b> and dared you to take{" "}
              <b className={dare.side === "yes" ? "text-yes" : "text-no"}>{dare.side.toUpperCase()}</b>.
            </span>
          </p>
        )}

        <div className={GRID}>
          <div className="min-w-0 space-y-6">
            <Activity marketId={marketId} />
            {!resolved && <ShareChallenge marketId={marketId} question={market.question} />}
          </div>

          <aside className={ASIDE}>
            {/* shown only when nothing else renders here (betting over, no positions of yours) */}
            {!isOpen && now > 0 && <p className="card hidden p-4 text-sm text-muted only:block">Betting closed.</p>}
            <ResolveButton marketId={marketId} market={market} now={now} onDone={refetch} />
            <BetPanel marketId={marketId} market={market} now={now} defaultSide={side ? side === "yes" : undefined} onPlaced={refetch} />
            <Positions marketId={marketId} market={market} now={now} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** "ETH $2,236.19 · $3.81 below the $2,240 strike", or the settled price once resolved. */
function PriceLine({ market, price, symbol }: { market: Market; price?: bigint; symbol: string }) {
  if (market.outcome === Outcome.Invalid) {
    const oneSided = market.yesPool === 0n || market.noPool === 0n;
    return (
      <p className="text-muted">
        {oneSided
          ? "Void: one side had no bets, everyone is refunded."
          : "Void: no Chainlink price settled it in time, everyone is refunded."}
      </p>
    );
  }

  const settled = market.outcome !== Outcome.Unresolved && market.finalPrice > 0n;
  const value = settled ? market.finalPrice : price;
  if (value === undefined)
    return (
      <span className="skeleton block h-6 w-80 max-w-full" role="status">
        <span className="sr-only">Loading {symbol} price</span>
      </span>
    );

  const diff = value - market.strike;
  const abs = diff < 0n ? -diff : diff;
  return (
    <p className="num text-base sm:text-lg">
      {settled ? "Settled at" : symbol} <span className="font-bold">{fmtUsd(value)}</span>
      <span className="text-muted"> · </span>
      {diff === 0n ? (
        <>exactly at the {fmtUsd(market.strike)} strike</>
      ) : (
        <>
          <span className={`font-semibold ${diff > 0n ? "text-yes" : "text-no"}`}>
            {fmtUsd(abs)} {diff > 0n ? "above" : "below"}
          </span>{" "}
          the {fmtUsd(market.strike)} strike
        </>
      )}
    </p>
  );
}

/** Pencil placeholders at the real height of the market page. */
export function MarketSkeleton() {
  return (
    <div className="space-y-12" aria-busy="true" role="status">
      <span className="sr-only">Loading market</span>
      <div>
        <div className="skeleton h-5 w-72 max-w-full" />
        <div className="skeleton mt-4 h-[clamp(2.25rem,5.5vw,3.25rem)] w-full max-w-3xl" />
        <div className="skeleton mt-5 h-6 w-80 max-w-full" />
        <div className="skeleton mt-6 h-[4.75rem] w-full" />
      </div>
      <div className={GRID}>
        <div className="skeleton h-64" />
        <div className="skeleton order-first h-[26rem] md:order-none" />
      </div>
    </div>
  );
}

export function MarketNotFound() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="font-display text-head">Market not found</h1>
      <p className="mt-2 text-muted">We couldn&apos;t load a market with that number. It may not exist yet.</p>
      <Link href="/" className="btn-ghost mt-6">
        <IconBack className="h-4 w-4" />
        All markets
      </Link>
    </div>
  );
}
