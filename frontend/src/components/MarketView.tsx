"use client";

import Link from "next/link";
import { Outcome } from "@/lib/config";
import { countdown, fmtUsd, shortAddr, status } from "@/lib/format";
import { useEthPrice, useMarket, useNow } from "@/lib/hooks";
import { Activity } from "./Activity";
import { BetPanel } from "./BetPanel";
import { Sparkle, Star, Underline } from "./Doodles";
import { PoolBar } from "./PoolBar";
import { Positions } from "./Positions";
import { ResolveButton } from "./ResolveButton";
import { ShareChallenge } from "./ShareChallenge";

export function MarketView({ id, side, from }: { id: string; side?: "yes" | "no"; from?: string }) {
  const marketId = BigInt(id);
  const { market, isLoading, refetch } = useMarket(marketId);
  const price = useEthPrice();
  const now = useNow();

  if (isLoading) return <div className="font-hand text-xl text-muted">gazing into the ball…</div>;
  if (!market)
    return (
      <div className="font-hand text-xl text-muted">
        couldn&apos;t find that market.{" "}
        <Link className="text-accent underline" href="/">
          back
        </Link>
      </div>
    );

  const resolved = market.outcome !== Outcome.Unresolved;
  const isOpen = !resolved && now > 0 && now < Number(market.closeTime);
  const above = price ? price.price > market.strike : undefined;
  const winner = market.outcome === Outcome.Yes ? "YES" : market.outcome === Outcome.No ? "NO" : null;

  return (
    <div className="space-y-7">
      <Link href="/" className="font-hand text-lg text-muted hover:text-ink">
        ← all markets
      </Link>

      {from && side && !resolved && (
        <div className="card -rotate-1 bg-hl/40 p-4 font-hand text-xl">
          <Sparkle className="mr-1 inline h-5 w-5 text-pink" />
          <span className="font-mono text-base">{shortAddr(from)}</span> called{" "}
          <b className={side === "yes" ? "text-no" : "text-yes"}>{side === "yes" ? "NO" : "YES"}</b> and dared you to take{" "}
          <b className={side === "yes" ? "text-yes" : "text-no"}>{side.toUpperCase()}</b>.
        </div>
      )}

      <div className="card relative p-6">
        <Star className="absolute -top-5 -left-4 hidden h-10 w-10 -rotate-12 text-hl sm:block" />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`chip ${isOpen ? "bg-hl/60" : "text-muted"}`}>{status(market, now)}</span>
          {isOpen && <span className="font-hand text-lg text-muted">⏳ closes in {countdown(market.closeTime, now)}</span>}
          <span className="font-hand text-lg text-muted">· #{id}</span>
        </div>

        <h1 className="relative mb-6 inline-block font-display text-5xl leading-[1.05] sm:text-6xl">
          {market.question}
          <Underline className="absolute -bottom-2 left-0 h-4 w-2/3 text-accent" />
        </h1>

        {winner && (
          <div className={`mb-5 inline-block -rotate-3 sketch px-4 py-1 font-display text-4xl ${winner === "YES" ? "text-yes" : "text-no"}`}>
            {winner} won!
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="strike" value={fmtUsd(market.strike)} tilt="-rotate-1" />
          {resolved && market.finalPrice > 0n ? (
            <Stat label="settled at" value={fmtUsd(market.finalPrice)} tilt="rotate-1" />
          ) : (
            <Stat
              label="ETH right now"
              value={price ? fmtUsd(price.price) : "…"}
              hint={above === undefined ? undefined : above ? "↑ above strike" : "↓ below strike"}
              tone={above === undefined ? undefined : above ? "yes" : "no"}
              tilt="rotate-1"
            />
          )}
          <Stat
            label="closes at"
            value={new Date(Number(market.closeTime) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            tilt="-rotate-[0.5deg]"
          />
        </div>

        <PoolBar market={market} big />
      </div>

      <ResolveButton marketId={marketId} market={market} now={now} onDone={refetch} />

      <div className="grid gap-7 md:grid-cols-[1.1fr_1fr]">
        <div className="space-y-7">
          <BetPanel marketId={marketId} market={market} now={now} defaultSide={side ? side === "yes" : undefined} onPlaced={refetch} />
          <Positions marketId={marketId} market={market} now={now} />
        </div>
        <div className="space-y-7 md:pt-6">
          <Activity marketId={marketId} />
          {!resolved && <ShareChallenge marketId={marketId} question={market.question} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone, tilt }: { label: string; value: string; hint?: string; tone?: "yes" | "no"; tilt?: string }) {
  return (
    <div className={`sketch-alt bg-background/70 p-3 ${tilt ?? ""}`}>
      <div className="font-hand text-base text-muted">{label}</div>
      <div className="font-display text-3xl leading-tight">{value}</div>
      {hint && <div className={`font-hand text-base ${tone === "yes" ? "text-yes" : "text-no"}`}>{hint}</div>}
    </div>
  );
}
