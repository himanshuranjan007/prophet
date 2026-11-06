// TEMPORARY type specimen to choose Prophet's fonts. Delete after the decision.
import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat, DM_Sans, Fraunces, Geist_Mono, Instrument_Serif, Inter, Nunito } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { CrystalBall, Underline } from "@/components/Doodles";

export const metadata: Metadata = { title: "Type specimen", robots: { index: false } };

const caveat = Caveat({ subsets: ["latin"], weight: ["700"], variable: "--sp-caveat" });
const nunito = Nunito({ subsets: ["latin"], variable: "--sp-nunito" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--sp-instrument" });
const inter = Inter({ subsets: ["latin"], variable: "--sp-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--sp-fraunces" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--sp-dmsans" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--sp-bricolage" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--sp-mono" });

type Option = {
  key: string;
  name: string;
  note: string;
  display: string;
  body: string;
  displayWeight: number;
  displayItalic?: boolean;
  tracking: string;
};

const OPTIONS: Option[] = [
  { key: "now", name: "Current · Caveat + Nunito", note: "Handwriting for headlines, rounded sans body.", display: "var(--sp-caveat)", body: "var(--sp-nunito)", displayWeight: 700, tracking: "0" },
  { key: "A", name: "A · Editorial · Instrument Serif + Inter", note: "Magazine-grade serif headlines; neutral, precise UI text.", display: "var(--sp-instrument)", body: "var(--sp-inter)", displayWeight: 400, displayItalic: true, tracking: "-0.01em" },
  { key: "B", name: "B · Warm serif · Fraunces + DM Sans", note: "Soft, characterful serif; friendly geometric body.", display: "var(--sp-fraunces)", body: "var(--sp-dmsans)", displayWeight: 600, displayItalic: true, tracking: "-0.02em" },
  { key: "C", name: "C · Modern grotesk · Bricolage Grotesque + Inter", note: "Confident, crisp, tech-forward.", display: "var(--sp-bricolage)", body: "var(--sp-inter)", displayWeight: 700, tracking: "-0.03em" },
];

export default function TypeSpecimen() {
  return (
    <div
      className={`${caveat.variable} ${nunito.variable} ${instrument.variable} ${inter.variable} ${fraunces.variable} ${dmSans.variable} ${bricolage.variable} ${mono.variable} space-y-14`}
    >
      {OPTIONS.map((o) => (
        <Specimen key={o.key} o={o} />
      ))}
    </div>
  );
}

function Specimen({ o }: { o: Option }) {
  const d: CSSProperties = { fontFamily: o.display, fontWeight: o.displayWeight, letterSpacing: o.tracking };
  const b: CSSProperties = { fontFamily: o.body };
  const num: CSSProperties = { fontFamily: o.body, fontVariantNumeric: "tabular-nums" };
  return (
    <section id={`opt-${o.key}`} style={b} className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">{o.name}</h2>
        <p className="text-sm text-muted">{o.note}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-start">
        {/* hero */}
        <div>
          <div className="mb-5 flex items-center gap-2">
            <CrystalBall className="h-8 w-8" />
            <span style={{ fontFamily: "var(--sp-caveat)", fontWeight: 700 }} className="text-3xl leading-none">
              Prophet
            </span>
          </div>
          <h1 style={{ ...d, lineHeight: 0.98 }} className="text-[clamp(3rem,7vw,4.25rem)]">
            Call it.
            <br />
            <span className="relative inline-block">
              <span className="highlight" style={o.displayItalic ? { fontStyle: "italic" } : undefined}>
                from any chain.
              </span>
              <Underline className="absolute -bottom-3 left-0 h-3.5 w-full text-ink" />
            </span>
          </h1>
          <p className="mt-7 max-w-[34rem] text-[1.0625rem] leading-relaxed text-muted">
            Bet <b className="font-semibold text-yes">YES</b> or <b className="font-semibold text-no">NO</b> from Base, Arbitrum or
            Ethereum. Chainlink CCIP pools every stake on Base, a Chainlink Data Feed settles it, and winnings go back to your chain.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Btn cls="btn-primary">Connect wallet</Btn>
            <Btn cls="btn-ghost">New market</Btn>
          </div>
        </div>

        {/* price card */}
        <div className="card p-6">
          <div className="eyebrow mb-3">Chainlink prices</div>
          {[
            ["ETH", "$2,244.87", "−6.83% 24h"],
            ["BTC", "$76,204.77", "−4.78% 24h"],
            ["SOL", "$90.61", "−5.36% 24h · via CCIP"],
          ].map(([s, p, c]) => (
            <div key={s} className="flex items-baseline gap-4 py-1.5">
              <span className="w-10 text-sm font-bold">{s}</span>
              <span style={num} className="text-lg font-bold">
                {p}
              </span>
              <span style={num} className="text-xs text-muted">
                {c}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* market card */}
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="status-dot" /> Open
            </span>
            <span style={num} className="text-muted">
              2h 56m
            </span>
          </div>
          <div style={{ ...d, lineHeight: 1.12 }} className="text-[1.65rem]">
            Will ETH be above $2,240 at 15:28 UTC?
          </div>
          <div style={num} className="flex justify-between text-sm">
            <span>
              <b className="text-yes">YES 57%</b> <span className="text-muted">· pays 1.75x</span>
            </span>
            <span>
              <span className="text-muted">pays 2.33x ·</span> <b className="text-no">43% NO</b>
            </span>
          </div>
          <div className="sketch-thin flex h-3 overflow-hidden">
            <div className="hatch-yes" style={{ width: "57%" }} />
            <div className="w-[1.5px] bg-ink" />
            <div className="hatch-no flex-1" />
          </div>
          <div style={num} className="text-xs text-muted">
            0.35 BnM pooled · 0.2 YES · 0.15 NO
          </div>
        </div>

        {/* bet panel bits */}
        <div className="card-primary space-y-4 p-6">
          <div style={d} className="text-[1.75rem] leading-tight">
            Place a bet
          </div>
          <div className="eyebrow">Bet from</div>
          <div style={num} className="text-[1.05rem]">
            ETH <b>$2,244.87</b> · <span className="font-semibold text-yes">$4.87 above</span> the $2,240 strike
          </div>
          <div className="flex gap-2">
            {["0.1", "0.5", "1"].map((v) => (
              <span key={v} className="chip" style={num}>
                {v}
              </span>
            ))}
            <span className="ml-auto text-sm" style={{ fontFamily: "var(--sp-mono)" }}>
              0x30E7…5BC9
            </span>
          </div>
          <Btn cls="btn-yes w-full py-3 text-base">Bet 0.1 on YES from Arbitrum</Btn>
        </div>
      </div>
    </section>
  );
}

function Btn({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span role="presentation" className={cls}>
      {children}
    </span>
  );
}
