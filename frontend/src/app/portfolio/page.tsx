import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata: Metadata = {
  title: "Your positions",
  description: "Every Prophet position for your wallet, across Base, Arbitrum and Ethereum: open bets, winnings to claim, CCIP trips in flight and history.",
};

/** The connected wallet's portfolio (client decides the address). */
export default function PortfolioPage() {
  return <PortfolioView />;
}
