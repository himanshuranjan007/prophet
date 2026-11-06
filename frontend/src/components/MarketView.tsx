"use client";

import Link from "next/link";
import { Outcome } from "@/lib/config";
import { countdown, fmtUsd, shortAddr, status } from "@/lib/format";
import { useEthPrice, useMarket, useNow } from "@/lib/hooks";
import { Activity } from "./Activity";
import { BetPanel } from "./BetPanel";
import { PoolBar } from "./PoolBar";
import { Positions } from "./Positions";
import { ResolveButton } from "./ResolveButton";
import { ShareChallenge } from "./ShareChallenge";

export function MarketView({ id, side, from }: { id: string; side?: "yes" | "no"; from?: string }) {
  const marketId = BigInt(id);
  const { market, isLoading, refetch } = useMarket(marketId);
  const price = useEthPrice();
  const now = useNow();

  if (isLoading) return <div className="text-sm text-muted">Loading market…</div>;
  if (!market) return <div className="text-sm text-muted">Market not found. <Link className="text-accent" href="/">Back</Link></div>;

  const resolved = market.outcome !== Outcome.Unresolved;
  const above = price ? price.price > market.strike : undefined;

  return (
    <div className="space-y-4">
      <Link href="/" className="text-xs text-muted hover:text-foreground">
        ← All markets
      </Link>

      {from && side && !resolved && (
        <div className="card border-accent/50 p-3 text-sm">
          <span className="font-mono">{shortAddr(from)}</span> challenged you. They&apos;re betting{" "}
          <b className={side === "yes" ? "text-no" : "text-yes"}>{side === "yes" ? "NO" : "YES"}</b>. Take{" "}
          <b className={side === "yes" ? "text-yes" : "text-no"}>{side.toUpperCase()}</b>?
        </div>
      )}

      <div className="card p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${resolved ? "bg-line" : "bg-accent/15 text-accent"}`}>
            {status(market, now)}
          </span>
          {!resolved && <span className="text-muted">closes in {countdown(market.closeTime, now)}</span>}
          <span className="text-muted">· #{id}</span>
        </div>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">{market.question}</h1>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Strike" value={fmtUsd(market.strike)} />
          {resolved && market.finalPrice > 0n ? (
            <Stat label="Settled at" value={fmtUsd(market.finalPrice)} />
          ) : (
            <Stat
              label="ETH/USD now"
              value={price ? fmtUsd(price.price) : "–"}
              hint={above === undefined ? undefined : above ? "above strike" : "below strike"}
              tone={above === undefined ? undefined : above ? "yes" : "no"}
            />
          )}
          <Stat label="Closes" value={new Date(Number(market.closeTime) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
        </div>

        <PoolBar market={market} big />
      </div>

      <ResolveButton marketId={marketId} market={market} now={now} onDone={refetch} />

      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <BetPanel marketId={marketId} market={market} now={now} defaultSide={side ? side === "yes" : undefined} onPlaced={refetch} />
          <Positions marketId={marketId} market={market} now={now} />
        </div>
        <div className="space-y-4">
          <Activity marketId={marketId} />
          {!resolved && <ShareChallenge marketId={marketId} question={market.question} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "yes" | "no" }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-lg">{value}</div>
      {hint && <div className={`text-xs ${tone === "yes" ? "text-yes" : "text-no"}`}>{hint}</div>}
    </div>
  );
}
