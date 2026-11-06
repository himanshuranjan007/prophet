import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getAddress, isAddress } from "viem";
import { PortfolioView, PortfolioSkeleton } from "@/components/portfolio/PortfolioView";
import { shortAddr } from "@/lib/format";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return { title: "Wallet not found" };
  return {
    title: `Positions · ${shortAddr(address)}`,
    description: `Prophet positions for ${shortAddr(address)} across Base, Arbitrum and Ethereum.`,
  };
}

/** Any wallet's portfolio, shareable by URL. Read-only unless it's the connected wallet. */
export default function WalletPortfolioPage(props: Props) {
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <WalletPortfolio {...props} />
    </Suspense>
  );
}

async function WalletPortfolio({ params }: Props) {
  await connection(); // per-request (live data); also marks the metadata as dynamic
  const { address } = await params;
  return <PortfolioView address={isAddress(address) ? getAddress(address) : undefined} invalid={!isAddress(address)} />;
}
