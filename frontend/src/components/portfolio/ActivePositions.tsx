"use client";

import { useId } from "react";
import Link from "next/link";
import type { Net } from "@/lib/config";
import { countdown, fmtToken, odds } from "@/lib/format";
import type { PortfolioMarket } from "@/lib/portfolio";
import { ChainDot } from "../ChainDot";
import { IconClock } from "../Doodles";
import { StatusLabel } from "../ui";

/** Markets still in play (open, or closed and waiting to resolve) with this wallet's stake per chain. */
export function ActivePositions({ items, now }: { items: PortfolioMarket[]; now: number }) {
  const uid = useId();
  return (
    <section className="card p-6" aria-labelledby={`${uid}-title`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${uid}-title`} className="font-display text-head">
          Open positions
        </h2>
        {items.length > 0 && (
          <span className="chip num">
            {items.length}
            <span className="sr-only"> {items.length === 1 ? "market" : "markets"}</span>
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <p>No open positions.</p>
          <Link href="/" className="btn-quiet">
            Find a market
          </Link>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-dashed divide-line">
          {items.map((item) => (
            <Row key={item.id} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ item, now }: { item: PortfolioMarket; now: number }) {
  const m = item.market;
  // now is 0 before hydration: show only the status until the clock runs
  const open = now > 0 && item.status === "open";
  const waiting = now > 0 && item.status === "closed";
  return (
    <li className="grid gap-x-8 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
      <div className="min-w-0 space-y-2">
        <h3 className="font-display text-[1.35rem] leading-tight break-words">
          <Link href={`/market/${item.id}`} className="decoration-1 underline-offset-4 hover:underline">
            {m.question}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <StatusLabel market={m} now={now} />
          {open && (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <IconClock className="h-4 w-4 shrink-0" />
              <span className="sr-only">Closes in</span>
              <span className="num">{countdown(m.closeTime, now)}</span>
            </span>
          )}
          {waiting && <span className="text-muted">Waiting for the Chainlink price</span>}
          {item.asset && <span className="chip">{item.asset.symbol}</span>}
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <ul aria-label="Your stake by chain" className="space-y-1.5">
          {item.chains.map((c) => (
            <li key={c.net.chain.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <ChainName net={c.net} />
              {c.yes > 0n && <Stake amount={c.yes} yes />}
              {c.no > 0n && <Stake amount={c.no} yes={false} />}
            </li>
          ))}
        </ul>
        <Potential item={item} />
        <SlimPoolBar item={item} />
      </div>
    </li>
  );
}

/** Dot only on phones (name kept for screen readers), dot + name from sm up. */
function ChainName({ net }: { net: Net }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold leading-none sm:min-w-[5.5rem]" title={net.short}>
      <ChainDot net={net} label={false} />
      <span className="sr-only sm:not-sr-only">{net.short}</span>
    </span>
  );
}

function Stake({ amount, yes }: { amount: bigint; yes: boolean }) {
  return (
    <span className={`num font-semibold ${yes ? "text-yes" : "text-no"}`}>
      {fmtToken(amount)} {yes ? "YES" : "NO"}
    </span>
  );
}

/** What each side the wallet holds would pay at the current pools. */
function Potential({ item }: { item: PortfolioMarket }) {
  const holdsYes = item.yes > 0n;
  const holdsNo = item.no > 0n;
  if (!holdsYes && !holdsNo) return null;
  return (
    <p className="text-sm text-muted">
      {holdsYes && (
        <span className="whitespace-nowrap">
          If <span className="font-semibold text-yes">YES</span> wins: <span className="num">{fmtToken(item.ifYes)} BnM</span>
        </span>
      )}
      {holdsYes && holdsNo && " · "}
      {holdsNo && (
        <span className="whitespace-nowrap">
          If <span className="font-semibold text-no">NO</span> wins: <span className="num">{fmtToken(item.ifNo)} BnM</span>
        </span>
      )}
    </p>
  );
}

/** A slim hatched YES/NO split of the market's pool (the full PoolBar is too heavy for a list row). */
function SlimPoolBar({ item }: { item: PortfolioMarket }) {
  const o = odds(item.market);
  const label = `Pool split: YES ${o.yesPct.toFixed(0)}%, NO ${o.noPct.toFixed(0)}%`;
  return (
    <div className="sketch-thin flex h-1.5 overflow-hidden bg-card" role="img" aria-label={label} title={label}>
      <div className="hatch-yes" style={{ width: `${o.yesPct}%` }} />
      <div className="hatch-no flex-1" />
    </div>
  );
}
