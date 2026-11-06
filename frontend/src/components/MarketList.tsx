"use client";

import Link from "next/link";
import { NETS, Outcome } from "@/lib/config";
import { countdown, fmtUsd, status } from "@/lib/format";
import { useEthPrice, useMarkets, useNow } from "@/lib/hooks";
import { ChainDot } from "./ChainDot";
import { CreateMarket } from "./CreateMarket";
import { PoolBar } from "./PoolBar";

export function MarketList() {
  const { list, isLoading, refetch } = useMarkets();
  const price = useEthPrice();
  const now = useNow();

  const open = list.filter((m) => m.outcome === Outcome.Unresolved && now < Number(m.closeTime));
  const rest = list.filter((m) => !open.includes(m));

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden p-6">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Call it. From any chain.</h1>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Bet YES or NO on where ETH lands. Bet from Base, Arbitrum or Ethereum: Chainlink CCIP carries your stake and your bet
          to one shared pool on Base, Chainlink Data Feeds settle it, and winnings come back to the chain you bet from.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          {NETS.map((n) => (
            <span key={n.chain.id} className="flex items-center gap-1.5">
              <ChainDot net={n} />
              <span>{n.isHub ? "hub" : `spoke · ${n.eta}`}</span>
            </span>
          ))}
          <span className="ml-auto font-mono text-foreground">ETH/USD {price ? fmtUsd(price.price) : "…"}</span>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Live markets</h2>
        <CreateMarket onCreated={refetch} />
      </div>

      {isLoading && <div className="text-sm text-muted">Loading markets…</div>}
      {!isLoading && open.length === 0 && <div className="text-sm text-muted">No open markets. Create one.</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        {open.map((m) => (
          <MarketCard key={m.id} m={m} now={now} />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">Closed &amp; settled</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((m) => (
              <MarketCard key={m.id} m={m} now={now} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MarketCard({ m, now }: { m: ReturnType<typeof useMarkets>["list"][number]; now: number }) {
  const openNow = m.outcome === Outcome.Unresolved && now < Number(m.closeTime);
  return (
    <Link href={`/market/${m.id}`} className="card block p-4 transition hover:border-accent">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className={`rounded-full px-2 py-0.5 ${openNow ? "bg-accent/15 text-accent" : "bg-line text-muted"}`}>{status(m, now)}</span>
        {openNow && <span className="font-mono text-muted">{countdown(m.closeTime, now)}</span>}
      </div>
      <div className="mb-3 font-medium leading-snug">{m.question}</div>
      <PoolBar market={m} />
    </Link>
  );
}
