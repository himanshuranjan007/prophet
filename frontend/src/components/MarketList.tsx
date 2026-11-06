"use client";

import Link from "next/link";
import { ASSETS, NETS, Outcome, assetByFeed, type Asset } from "@/lib/config";
import { countdown, fmtUsd } from "@/lib/format";
import { useAssetPrice, useMarkets, useNow } from "@/lib/hooks";
import { ChainDot } from "./ChainDot";
import { CreateMarket } from "./CreateMarket";
import { IconClock, Sparkle, Underline } from "./Doodles";
import { PoolBar } from "./PoolBar";
import { Sparkline, useChange } from "./Sparkline";
import { StatusLabel } from "./ui";

type ListedMarket = ReturnType<typeof useMarkets>["list"][number];

export function MarketList() {
  const { list, isLoading, refetch } = useMarkets();
  const now = useNow();

  const open = list.filter((m) => m.outcome === Outcome.Unresolved && now < Number(m.closeTime));
  const rest = list.filter((m) => !open.includes(m));

  return (
    <div className="space-y-12">
      {/* ---------------- hero */}
      <section className="grid gap-8 pt-2 md:grid-cols-[1.35fr_1fr] lg:grid-cols-[1.75fr_1fr] md:items-center md:gap-10">
        <div className="min-w-0">
          <h1 className="font-display text-hero">
            Call it.
            <Sparkle className="ml-2 inline-block h-6 w-6 align-top text-muted" />
            <br />
            <span className="relative inline-block">
              <span className="highlight italic">from any chain.</span>
              <Underline className="absolute -bottom-3 left-0 h-3.5 w-full text-ink" />
            </span>
          </h1>
          <p className="mt-8 max-w-[38rem] leading-relaxed text-muted">
            Bet <b className="font-semibold text-yes">YES</b> or <b className="font-semibold text-no">NO</b> from Base, Arbitrum
            or Ethereum. Chainlink CCIP pools every stake on Base, a Chainlink Data Feed settles it, and winnings go back to
            your chain.
          </p>
        </div>

        <div className="card p-6">
          <div className="eyebrow mb-3">Chainlink prices</div>
          <ul className="space-y-3">
            {ASSETS.map((a) => (
              <AssetRow key={a.symbol} asset={a} now={now} />
            ))}
          </ul>
          <div className="rule my-4" />
          <ul className="space-y-2.5">
            {NETS.map((n) => (
              <li key={n.chain.id} className="flex items-center justify-between gap-3">
                <ChainDot net={n} />
                <span className="num text-right text-sm text-muted">{n.isHub ? `the pool · ${n.eta}` : `via CCIP · ${n.eta}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- live markets */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-head">Live markets</h2>
          <CreateMarket onCreated={refetch} />
        </div>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2" aria-busy="true" aria-label="Loading markets">
            <div className="skeleton h-44" />
            <div className="skeleton h-44" />
          </div>
        ) : open.length === 0 ? (
          <p className="text-muted">No open markets right now. Create one to get things going.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {open.map((m) => (
              <MarketCard key={m.id} m={m} now={now} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- closed & settled */}
      {rest.length > 0 && (
        <section className="space-y-6">
          <h2 className="font-display text-head text-muted">Closed &amp; settled</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {rest.map((m) => (
              <MarketCard key={m.id} m={m} now={now} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** "ETH  $2,236.19  +0.8%  ~~sparkline~~" */
function AssetRow({ asset, now }: { asset: Asset; now: number }) {
  const price = useAssetPrice(asset);
  const change = useChange(asset, now, 24);
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.5rem] items-center gap-3">
      <span className="text-sm font-bold">{asset.symbol}</span>
      <span className="min-w-0">
        {price ? (
          <span className="num block truncate text-lg font-extrabold leading-tight">{fmtUsd(price.price)}</span>
        ) : (
          <span className="skeleton block h-6 w-28" aria-label={`Loading ${asset.symbol} price`} />
        )}
        <span className="num block text-xs text-muted">
          {change === undefined ? "24h …" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}% 24h`}
          {asset.relay ? " · via CCIP" : ""}
        </span>
      </span>
      <Sparkline asset={asset} now={now} hours={24} />
    </li>
  );
}

function MarketCard({ m, now }: { m: ListedMarket; now: number }) {
  const openNow = m.outcome === Outcome.Unresolved && now < Number(m.closeTime);
  const asset = assetByFeed(m.feed);
  return (
    <Link
      href={`/market/${m.id}`}
      className="card flex h-full flex-col gap-4 p-5 transition-[translate,box-shadow] duration-(--dur-quick) ease-(--ease-out) hover:-translate-y-px hover:shadow-(--shadow-sm) motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <StatusLabel market={m} now={now} />
        {openNow && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <IconClock className="h-4 w-4 shrink-0" />
            <span className="num">{countdown(m.closeTime, now)}</span>
          </span>
        )}
      </div>
      <div className="flex-1 font-display text-[1.6rem] leading-tight break-words">{m.question}</div>
      {asset && openNow && <Sparkline asset={asset} now={now} hours={6} strike={m.strike} />}
      <PoolBar market={m} />
    </Link>
  );
}
