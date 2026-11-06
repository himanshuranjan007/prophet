import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Crosscall · cross-chain predictions",
  description: "Bet YES/NO on prices from any chain. One shared pool, settled by Chainlink Data Feeds, moved by CCIP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="border-b border-line">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-white">✕</span>
                Crosscall
                <span className="hidden rounded-full border border-line px-2 py-0.5 text-xs font-normal text-muted sm:inline">
                  testnet · CCIP 2.0
                </span>
              </Link>
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-line py-4 text-center text-xs text-muted">
            Positions live on Base Sepolia · bets from Arbitrum &amp; Ethereum Sepolia travel via Chainlink CCIP ·
            settled by Chainlink ETH/USD Data Feed
          </footer>
        </Providers>
      </body>
    </html>
  );
}
