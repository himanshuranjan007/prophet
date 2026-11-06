"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useConnection } from "wagmi";
import { usePortfolio } from "@/lib/portfolio";
import { useNow } from "@/lib/hooks";
import { IconBack } from "../Doodles";
import { ActivePositions } from "./ActivePositions";
import { ClaimableList } from "./ClaimableList";
import { History } from "./History";
import { InFlight } from "./InFlight";
import { PortfolioHeader } from "./PortfolioHeader";
import { Summary } from "./Summary";

/**
 * A wallet's positions across every market and chain. Data comes from the hub on Base and event logs
 * on all three chains, so it doesn't depend on (or change with) the wallet's current network.
 * - `/portfolio`            -> the connected wallet
 * - `/portfolio/[address]`  -> any wallet (read-only unless it's the connected one)
 */
export function PortfolioView({ address: param, invalid }: { address?: Address; invalid?: boolean }) {
  const { address: connected, status } = useConnection();
  const now = useNow();
  const address = param ?? connected;
  const isSelf = !!address && !!connected && address.toLowerCase() === connected.toLowerCase();
  const { portfolio, marketById, loading, logsLoading, logsError } = usePortfolio(invalid ? undefined : address, now);

  if (invalid) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="font-display text-head">That isn&apos;t a wallet address</h1>
        <p className="mt-2 text-muted">Check the link: a wallet address starts with 0x and has 40 hex characters.</p>
        <Link href="/portfolio" className="btn-ghost mt-6">
          <IconBack className="h-4 w-4" />
          Your positions
        </Link>
      </div>
    );
  }

  // A wallet that never bet: the Summary's "No calls yet" card says it once instead of three empty cards.
  // While logs load with nothing landed, the Summary's skeleton stands alone, so nothing flashes.
  const nothing =
    !!portfolio &&
    !logsError &&
    portfolio.markets.length === 0 &&
    portfolio.inFlight.length === 0 &&
    portfolio.history.length === 0;

  return (
    <div className="space-y-12">
      <PortfolioHeader address={address} isSelf={isSelf} reconnecting={status === "reconnecting"} />
      {address &&
        (loading || !portfolio ? (
          <PortfolioBodySkeleton />
        ) : (
          <>
            <Summary portfolio={portfolio} logsLoading={logsLoading} />
            {!nothing && (
              <>
                <ClaimableList items={portfolio.claimable} canAct={isSelf} now={now} trips={portfolio.inFlight} />
                <InFlight trips={portfolio.inFlight} marketById={marketById} now={now} logsLoading={logsLoading} />
                <ActivePositions items={portfolio.active} now={now} />
                <History
                  items={portfolio.history}
                  settled={portfolio.settled}
                  marketById={marketById}
                  loading={logsLoading}
                  error={logsError}
                />
              </>
            )}
          </>
        ))}
    </div>
  );
}

function PortfolioBodySkeleton() {
  return (
    <div className="space-y-12" aria-busy="true" role="status">
      <span className="sr-only">Loading positions</span>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[7.5rem]" />
        ))}
      </div>
      <div className="skeleton h-40" />
      <div className="skeleton h-64" />
    </div>
  );
}

/** Pencil placeholders at the real height of the page (Suspense fallback for /portfolio/[address]). */
export function PortfolioSkeleton() {
  return (
    <div className="space-y-12" aria-busy="true" role="status">
      <span className="sr-only">Loading positions</span>
      <div>
        <div className="skeleton h-5 w-40" />
        <div className="skeleton mt-4 h-[clamp(2.25rem,5vw,3.25rem)] w-80 max-w-full" />
        <div className="skeleton mt-4 h-6 w-96 max-w-full" />
      </div>
      <PortfolioBodySkeleton />
    </div>
  );
}
