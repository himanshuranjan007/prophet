"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NETS, Outcome } from "@/lib/config";
import { fmtToken } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio";
import { ChainDot } from "../ChainDot";
import { IconPlane } from "../Doodles";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Four headline numbers for the wallet, plus where its stake sits (by chain). */
export function Summary({ portfolio, logsLoading }: { portfolio: Portfolio; logsLoading: boolean }) {
  const { markets, active, claimable, settled, inFlight, history, totals } = portfolio;

  // Bets that are still crossing (or only show up in logs) aren't known until the logs load.
  const empty = markets.length === 0 && inFlight.length === 0 && history.length === 0;
  if (empty && logsLoading) return <SummarySkeleton />;
  if (empty) return <NoCalls />;

  // paid amounts come from the hub's Claimed logs: a paid-out win reads as a loss until they're in
  const payoutsUnknown =
    logsLoading ||
    settled.some((p) =>
      p.chains.some(
        (c) =>
          c.claimed &&
          c.paid === 0n &&
          (p.market.outcome === Outcome.Yes ? c.yes : p.market.outcome === Outcome.No ? c.no : c.yes + c.no) > 0n,
      ),
    );
  const ready = claimable.filter((p) => p.status === "claim").length;
  const paying = claimable.length - ready;
  const claimSub = [ready > 0 && `${ready} to claim`, paying > 0 && `${paying} on the way`].filter(Boolean).join(" · ");

  const byChain = NETS.map((n) => ({
    n,
    total: markets.reduce(
      (sum, m) => sum + m.chains.filter((c) => c.net.chain.id === n.chain.id).reduce((s, c) => s + c.yes + c.no, 0n),
      0n,
    ),
  })).filter((x) => x.total > 0n);

  return (
    <section aria-labelledby="portfolio-summary">
      <h2 id="portfolio-summary" className="sr-only">
        Summary
      </h2>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <Tile label="At stake" sub={active.length ? `in ${plural(active.length, "open market")}` : "No open markets"}>
          <Amount value={totals.atStake} />
        </Tile>

        <Tile label="Claimable" sub={claimSub || "Nothing to claim"}>
          <Amount value={totals.claimable} />
        </Tile>

        <Tile
          label="In flight"
          sub={
            logsLoading ? (
              "Checking all three chains…"
            ) : inFlight.length ? (
              <span className="inline-flex items-center gap-1.5">
                <IconPlane className="wiggle h-4 w-4 shrink-0" />
                {plural(inFlight.length, "CCIP trip")}
              </span>
            ) : (
              "Nothing crossing chains"
            )
          }
        >
          {logsLoading ? <ValueSkeleton /> : <Amount value={totals.inFlight} />}
        </Tile>

        <Tile label="Net result" sub={settled.length ? `${totals.wins} won · ${totals.losses} lost` : "No settled markets yet"}>
          {!settled.length ? (
            <span className="num text-2xl font-bold">–</span>
          ) : payoutsUnknown ? (
            <ValueSkeleton />
          ) : (
            <Pnl value={totals.pnl} />
          )}
        </Tile>
      </dl>

      {byChain.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span id="portfolio-by-chain" className="eyebrow">
            Staked by chain
          </span>
          <ul aria-labelledby="portfolio-by-chain" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {byChain.map(({ n, total }) => (
              <li key={n.chain.id} className="inline-flex items-center gap-1.5">
                <ChainDot net={n} />
                <span className="num">{fmtToken(total)} BnM</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tile({ label, sub, children }: { label: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="card min-w-0 p-5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2">{children}</dd>
      <dd className="mt-1 text-sm text-muted">{sub}</dd>
    </div>
  );
}

/** "1.25 BnM": the number big, the unit small and muted. */
function Amount({ value, prefix = "", className }: { value: bigint; prefix?: string; className?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className={`num text-2xl font-bold wrap-anywhere ${className ?? ""}`}>
        {prefix}
        {fmtToken(value)}
      </span>
      <span className="text-sm font-semibold text-muted">BnM</span>
    </span>
  );
}

/** Signed result in ink: the sign carries it (yes/no colours stay on the YES/NO words). Plain at zero. */
function Pnl({ value }: { value: bigint }) {
  const abs = value < 0n ? -value : value;
  if (fmtToken(abs) === "0") return <Amount value={0n} />;
  return <Amount value={abs} prefix={value > 0n ? "+" : "−"} />;
}

function ValueSkeleton() {
  return (
    <span className="skeleton block h-8 w-24 max-w-full">
      <span className="sr-only">Loading</span>
    </span>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6" aria-busy="true" role="status">
      <span className="sr-only">Loading summary</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-[7.5rem]" />
      ))}
    </div>
  );
}

function NoCalls() {
  return (
    <section aria-labelledby="portfolio-no-calls" className="card max-w-xl p-6">
      <h2 id="portfolio-no-calls" className="font-display text-head">
        No calls yet
      </h2>
      <p className="mt-2 text-muted">
        Bets placed from Base, Arbitrum or Ethereum show up here, with anything to claim and every CCIP trip on its way.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Browse live markets
      </Link>
    </section>
  );
}
