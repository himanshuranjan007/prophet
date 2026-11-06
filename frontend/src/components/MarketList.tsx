"use client";

import Link from "next/link";
import { NETS, Outcome } from "@/lib/config";
import { countdown, fmtUsd, status } from "@/lib/format";
import { useEthPrice, useMarkets, useNow } from "@/lib/hooks";
import { ChainDot } from "./ChainDot";
import { CreateMarket } from "./CreateMarket";
import { Arrow, Hop, Sparkle, Star, Underline } from "./Doodles";
import { PoolBar } from "./PoolBar";

export function MarketList() {
  const { list, isLoading, refetch } = useMarkets();
  const price = useEthPrice();
  const now = useNow();

  const open = list.filter((m) => m.outcome === Outcome.Unresolved && now < Number(m.closeTime));
  const rest = list.filter((m) => !open.includes(m));

  return (
    <div className="space-y-10">
      {/* ---------------- hero: laid out on a grid, then nudged off it */}
      <section className="relative grid gap-6 pt-2 md:grid-cols-[1.35fr_1fr] md:items-center">
        <div className="relative">
          <Sparkle className="wiggle absolute -top-3 -left-2 h-6 w-6 text-pink" />
          <h1 className="font-display text-6xl leading-[0.95] sm:text-7xl">
            Call it.
            <br />
            <span className="relative inline-block">
              <span className="highlight">from any chain.</span>
              <Underline className="absolute -bottom-3 left-0 h-4 w-full text-accent" />
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
            Bet <b className="text-yes">YES</b> or <b className="text-no">NO</b> on where ETH lands. Bet from Base, Arbitrum or
            Ethereum: <span className="text-ink">Chainlink CCIP</span> carries your stake to one shared pool, a{" "}
            <span className="text-ink">Chainlink Data Feed</span> settles it, and winnings fly back to the chain you bet from.
          </p>
        </div>

        <div className="card tilt-r relative p-5">
          <Star className="absolute -top-4 -right-3 h-8 w-8 rotate-12 text-hl" />
          <div className="mb-1 font-hand text-lg text-muted">ETH / USD right now</div>
          <div className="font-display text-5xl">{price ? fmtUsd(price.price) : "…"}</div>
          <div className="mt-4 flex items-center justify-between gap-2">
            {NETS.map((n, i) => (
              <div key={n.chain.id} className={`flex flex-col items-center ${i === 1 ? "translate-y-1" : ""}`}>
                <ChainDot net={n} />
                <span className="font-hand text-sm text-muted">{n.isHub ? "the hub" : n.eta}</span>
              </div>
            ))}
          </div>
          <Hop className="mt-1 h-8 w-full text-muted" />
        </div>
      </section>

      {/* ---------------- markets */}
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display -rotate-1 text-4xl">
          Live markets
          <Arrow className="ml-2 hidden h-9 w-14 sm:inline-block -rotate-6 align-bottom text-muted" />
        </h2>
        <CreateMarket onCreated={refetch} />
      </div>

      {isLoading && <div className="font-hand text-lg text-muted">shuffling the cards…</div>}
      {!isLoading && open.length === 0 && (
        <div className="font-hand text-lg text-muted">No open markets right now. Make one ↑</div>
      )}

      <div className="grid gap-7 sm:grid-cols-2">
        {open.map((m, i) => (
          <MarketCard key={m.id} m={m} now={now} i={i} />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <h2 className="font-display rotate-1 pt-2 text-3xl text-muted">Closed &amp; settled</h2>
          <div className="grid gap-7 sm:grid-cols-2">
            {rest.map((m, i) => (
              <MarketCard key={m.id} m={m} now={now} i={i + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MarketCard({ m, now, i }: { m: ReturnType<typeof useMarkets>["list"][number]; now: number; i: number }) {
  const openNow = m.outcome === Outcome.Unresolved && now < Number(m.closeTime);
  return (
    <Link
      href={`/market/${m.id}`}
      className={`card group block p-5 transition-transform hover:-translate-y-1 hover:rotate-0 ${i % 2 ? "tilt-r" : "tilt-l"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`chip ${openNow ? "bg-hl/60 text-ink" : "text-muted"}`}>{status(m, now)}</span>
        {openNow && <span className="font-hand text-base text-muted">⏳ {countdown(m.closeTime, now)}</span>}
      </div>
      <div className="mb-4 font-display text-[1.9rem] leading-tight">{m.question}</div>
      <PoolBar market={m} />
    </Link>
  );
}
