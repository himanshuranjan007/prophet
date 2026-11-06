import type { Metadata } from "next";
import { Caveat, Nunito } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import { CrystalBall, Rule } from "@/components/Doodles";
import "./globals.css";

const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["700"] });
const body = Nunito({ variable: "--font-body", subsets: ["latin"] });

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const description =
  "Prediction markets you can bet on from any chain. One shared pool on Base, moved by Chainlink CCIP, settled by Chainlink Data Feeds.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Prophet · call it from any chain", template: "%s · Prophet" },
  description,
  openGraph: { title: "Prophet · call it from any chain", description, siteName: "Prophet" },
  twitter: { card: "summary_large_image", title: "Prophet · call it from any chain", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${caveat.variable} ${body.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-sm">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="flex items-center gap-2" aria-label="Prophet home">
                <CrystalBall className="h-8 w-8" />
                <span className="font-display text-3xl leading-none">Prophet</span>
                <span className="ml-2 hidden items-center gap-1.5 text-xs font-semibold text-muted sm:inline-flex">
                  <span className="status-dot" /> testnet · CCIP 2.0
                </span>
              </Link>
              <ConnectButton />
            </div>
            <Rule className="block h-1.5 w-full text-line" />
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
          <footer className="mx-auto w-full max-w-5xl px-4 pb-8">
            <Rule className="mb-4 block h-1.5 w-full text-line" />
            <p className="text-center text-xs text-muted">
              Pool on Base Sepolia · bets travel from Arbitrum &amp; Ethereum Sepolia via Chainlink CCIP · settled by Chainlink Data Feeds
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
