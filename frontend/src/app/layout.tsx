import type { Metadata } from "next";
import { Caveat, Geist_Mono, Nunito, Patrick_Hand } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import { CrystalBall, Squiggle } from "@/components/Doodles";
import "./globals.css";

const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["600", "700"] });
const patrick = Patrick_Hand({ variable: "--font-patrick", subsets: ["latin"], weight: "400" });
const body = Nunito({ variable: "--font-body", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Prophet · call it from any chain",
  description:
    "Hand-drawn prediction markets. Bet YES or NO on prices from Base, Arbitrum or Ethereum: one shared pool, moved by Chainlink CCIP, settled by Chainlink Data Feeds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${caveat.variable} ${patrick.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <header className="relative">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-5 pb-3">
              <Link href="/" className="group flex items-center gap-2">
                <CrystalBall className="h-10 w-10 text-accent transition-transform group-hover:-rotate-12" />
                <span className="font-display text-4xl leading-none">Prophet</span>
                <span className="chip ml-1 hidden -rotate-3 text-muted sm:inline-flex">testnet · CCIP 2.0</span>
              </Link>
              <ConnectButton />
            </div>
            <Squiggle className="mx-auto block h-3 w-[min(92%,62rem)] text-ink/25" />
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
          <footer className="px-4 pt-6 pb-8 text-center font-hand text-base text-muted">
            positions live on Base Sepolia · bets from Arbitrum &amp; Ethereum Sepolia travel by Chainlink CCIP · settled by the
            Chainlink ETH/USD feed
          </footer>
        </Providers>
      </body>
    </html>
  );
}
