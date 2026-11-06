"use client";

import { useId } from "react";
import Link from "next/link";
import { Outcome, ccipExplorerTx } from "@/lib/config";
import { fmtToken } from "@/lib/format";
import type { ChainPosition, PortfolioMarket } from "@/lib/portfolio";
import { useClaim } from "@/lib/useClaim";
import { ChainDot } from "../ChainDot";
import { IconPlane } from "../Doodles";
import { ActionError, ExternalLink, StatusLabel } from "../ui";

/**
 * The page's one primary surface: every (market, chain) position the hub would pay out now.
 * Claims run on the chain the bet came from (hub direct, spokes via CCIP), so the wallet may be asked
 * to switch network; nothing here depends on the network it's on now. Renders nothing when empty.
 */
export function ClaimableList({ items, canAct, now }: { items: PortfolioMarket[]; canAct: boolean; now: number }) {
  const { claim, action, isBusy, claimInFlight } = useClaim();
  const uid = useId();

  const rows = items
    .map((item) => ({ item, chains: item.chains.filter((c) => c.claimable > 0n) }))
    .filter((r) => r.chains.length > 0);
  if (rows.length === 0) return null;

  const renderAction = (item: PortfolioMarket, c: ChainPosition, qid: string) => {
    const pending = claimInFlight(item.id, c.net);
    // "paying" comes from a spoke ClaimSent log; hub claims settle in one tx, so it never applies to Base
    const flying = !!pending || (item.status === "paying" && !c.net.isHub);
    if (flying) {
      return (
        <>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <IconPlane className="wiggle h-4 w-4 shrink-0" />
            Claim flying to the hub
          </span>
          {pending && (
            <ExternalLink href={ccipExplorerTx(pending.srcTx)} title={`Claim sent from ${c.net.short} via Chainlink CCIP`}>
              Track
            </ExternalLink>
          )}
        </>
      );
    }
    if (!canAct) {
      return (
        <span className="text-muted" title="Only this wallet can claim its winnings">
          Owner only
        </span>
      );
    }
    const busyHere = isBusy(item.id, c.net);
    return (
      <>
        {!c.net.isHub && (
          <span className="text-muted">
            via CCIP · <span className="num">~25 min</span>
          </span>
        )}
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={!canAct || action.busy}
          aria-busy={busyHere || undefined}
          aria-describedby={qid}
          onClick={() => void claim(BigInt(item.id), c.net)}
        >
          {busyHere ? action.step : `Claim on ${c.net.short}`}
        </button>
      </>
    );
  };

  return (
    <section className="card-primary p-6" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="font-display text-head">
        Ready to claim
      </h2>
      <p className="mt-1 text-sm text-muted">Winnings and refunds are paid on the chain you bet from.</p>

      <ul className="mt-2 divide-y divide-dashed divide-line">
        {rows.map(({ item, chains }) => {
          const qid = `${uid}-q-${item.id}`;
          const refund = item.market.outcome === Outcome.Invalid;
          return (
            <li key={item.id} className="space-y-3 py-4">
              <div className="space-y-1.5">
                <h3 id={qid} className="font-display text-[1.35rem] leading-tight break-words">
                  <Link href={`/market/${item.id}`} className="decoration-1 underline-offset-4 hover:underline">
                    {item.market.question}
                  </Link>
                </h3>
                <StatusLabel market={item.market} now={now} />
              </div>
              <ul className="space-y-2">
                {chains.map((c) => (
                  <li key={c.net.chain.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <ChainDot net={c.net} />
                      <span className="num font-semibold">{fmtToken(c.claimable)} BnM</span>
                      {refund && <span className="text-sm text-muted">refund</span>}
                    </span>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
                      {renderAction(item, c, qid)}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <p className="sr-only" role="status">
        {action.step ?? ""}
      </p>
      <ActionError action={action} className="mt-4" />
    </section>
  );
}
