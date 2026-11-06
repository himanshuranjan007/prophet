"use client";

import { useId } from "react";
import { Outcome, ccipExplorerMsg, ccipExplorerTx } from "@/lib/config";
import type { ChainPosition, PortfolioMarket, Trip } from "@/lib/portfolio";
import { useClaim } from "@/lib/useClaim";
import { ChainDot } from "../ChainDot";
import { IconPlane } from "../Doodles";
import { ActionError, ExternalLink, StatusLabel } from "../ui";
import { QuestionTitle, Tokens } from "./parts";

/** A claim sent from this browser that the hub still hasn't marked claimed after this long was ignored. */
const PENDING_CLAIM_MAX = 90 * 60;

/**
 * The page's one primary surface: every (market, chain) position the hub would pay out now.
 * Claims run on the chain the bet came from (hub direct, spokes via CCIP), so the wallet may be asked
 * to switch network; nothing here depends on the network it's on now. Renders nothing when empty.
 * Read-only (another wallet): a plain card without buttons, since there's nothing to act on.
 */
export function ClaimableList({
  items,
  canAct,
  now,
  trips,
}: {
  items: PortfolioMarket[];
  canAct: boolean;
  now: number;
  /** CCIP trips from the logs: a spoke claim crossing to the hub shows on its own chain's line */
  trips?: Trip[];
}) {
  const { claim, action, isBusy, claimInFlight } = useClaim();
  const uid = useId();

  const rows = items
    .map((item) => ({ item, chains: item.chains.filter((c) => c.claimable > 0n) }))
    .filter((r) => r.chains.length > 0);
  if (rows.length === 0) return null;

  /** The spoke claim already on its way for this (market, chain), if any, with a link to follow it. */
  const flyingClaim = (item: PortfolioMarket, c: ChainPosition): { href?: string } | undefined => {
    if (c.net.isHub) return undefined; // hub claims settle in one tx
    const trip = trips?.find((t) => t.kind === "claim" && t.marketId === item.id && t.net.chain.id === c.net.chain.id);
    if (trip) return { href: ccipExplorerMsg(trip.messageId) };
    const local = claimInFlight(item.id, c.net);
    if (local && (now === 0 || now - local.at < PENDING_CLAIM_MAX)) {
      return { href: local.msgId ? ccipExplorerMsg(local.msgId) : ccipExplorerTx(local.srcTx) };
    }
    // without trips we only know it per market
    if (!trips && item.status === "paying") return {};
    return undefined;
  };

  const renderAction = (item: PortfolioMarket, c: ChainPosition, qid: string) => {
    const flying = flyingClaim(item, c);
    if (flying) {
      return (
        <>
          <span className="inline-flex items-center gap-1.5 text-muted">
            <IconPlane className="wiggle h-4 w-4 shrink-0" />
            Claim crossing to Base
          </span>
          {flying.href && (
            <ExternalLink href={flying.href} title={`Claim sent from ${c.net.short} via Chainlink CCIP`}>
              Track
            </ExternalLink>
          )}
        </>
      );
    }
    if (!canAct) return null;
    const busyHere = isBusy(item.id, c.net);
    return (
      <>
        {!c.net.isHub && (
          <span className="text-muted">
            via CCIP · <span className="num">{c.net.eta}</span>
          </span>
        )}
        <button
          type="button"
          className="btn-primary text-sm"
          disabled={action.busy}
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
    <section className={`${canAct ? "card-primary" : "card"} p-6`} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="font-display text-head">
        Ready to claim
      </h2>
      <p className="mt-1 text-sm text-muted">
        Winnings and refunds are paid on the chain each bet came from.
        {!canAct && " Only this wallet's owner can claim them."}
      </p>

      <ul className="mt-2 divide-y divide-dashed divide-line">
        {rows.map(({ item, chains }) => {
          const qid = `${uid}-q-${item.id}`;
          const refund = item.market.outcome === Outcome.Invalid;
          return (
            <li key={item.id} className="space-y-3 py-4">
              <div className="space-y-1.5">
                <QuestionTitle id={item.id} question={item.market.question} titleId={qid} />
                <StatusLabel market={item.market} now={now} />
              </div>
              <ul className="space-y-2" aria-label="To claim, by chain">
                {chains.map((c) => (
                  <li key={c.net.chain.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <ChainDot net={c.net} />
                      <Tokens amount={c.claimable} />
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
