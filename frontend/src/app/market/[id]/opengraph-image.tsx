import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getMarket } from "@/lib/server";
import { fmtToken, fmtUsd, odds, outcomeLabel } from "@/lib/format";

export const alt = "Prophet prediction market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// "ink on paper" tokens (light theme, see globals.css)
const PAPER = "#fbf6ea";
const DOT = "#e8dfc8";
const CARD = "#fffdf7";
const INK = "#221f1a";
const MUTED = "#6e675a";
const YES = "#16652b";
const NO = "#ec6432";
const HL = "#ffd43b";

const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

// Fonts don't depend on the request: read them once per server instance.
const [caveat, serif, serifItalic, inter, interBold] = await Promise.all([
  font("caveat", "caveat-latin-700-normal.woff"),
  font("instrument-serif", "instrument-serif-latin-400-normal.woff"),
  font("instrument-serif", "instrument-serif-latin-400-italic.woff"),
  font("inter", "inter-latin-400-normal.woff"),
  font("inter", "inter-latin-700-normal.woff"),
]);

/** Marker swipe across the lower half of the letters, per word so it never becomes a full-width slab. */
const marker = `linear-gradient(transparent 52%, ${HL}d9 52%, ${HL}b3 88%, transparent 88%)`;

/** Long questions step down in size so they stay within three lines. */
const questionSize = (q: string) => (q.length <= 48 ? 92 : q.length <= 80 ? 76 : 62);
/** Clip very long questions at a word boundary. */
const clip = (q: string, max = 120) => {
  if (q.length <= max) return q;
  const cut = q.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : max).replace(/[\s,.;:]+$/, "")}…`;
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = /^\d{1,9}$/.test(id) ? await getMarket(id) : null;
  const o = m ? odds(m) : { yesPct: 50, noPct: 50, total: 0n };
  const yes = Math.round(o.yesPct); // round once so YES + NO always reads 100
  const question = clip(m?.question ?? "Market not found");
  const qSize = questionSize(question);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          backgroundImage: `radial-gradient(circle 2.5px at center, ${DOT} 0%, ${DOT} 60%, transparent 100%)`,
          backgroundSize: "34px 34px",
          color: INK,
          padding: "52px 64px 48px",
          fontFamily: "Inter",
        }}
      >
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="56" height="56" viewBox="0 0 48 48">
            <path fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M24 5.5c9.6-.4 16.9 6.7 16.6 15.6-.3 8.6-7.4 15.3-16.4 15.2C15 36.2 7.6 29.4 7.6 20.7 7.7 12.4 14.6 5.9 24 5.5z" />
            <path fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.6" d="M14.5 15.5c1.4-3.3 4.4-5.6 8-6.2" />
            <path fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M13 36.8c-1.5 1.7-2.6 3.6-3 5.6 9.4.9 19.1.8 28.4-.2-.5-2-1.6-3.8-3.2-5.4" />
            <path fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" d="M9.5 42.6c9.8 1.2 19.6 1.1 29.2-.3" />
            <path fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" d="M27.5 17.2l1.3 3.4 3.4 1.1-3.4 1.3-1.2 3.5-1.3-3.5-3.4-1.2 3.4-1.2z" />
          </svg>
          <span style={{ fontFamily: "Caveat", fontSize: 54, lineHeight: 1 }}>Prophet</span>
          <span style={{ fontSize: 26, color: MUTED, marginLeft: 8 }}>· call it from any chain</span>
        </div>

        {/* question */}
        <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Instrument Serif", fontSize: qSize, lineHeight: 1.06, marginRight: -18 }}>
          {question.split(/\s+/).map((w, i) => (
            <span key={i} style={{ backgroundImage: marker, paddingRight: Math.round(qSize * 0.22) }}>
              {w}
            </span>
          ))}
        </div>

        {/* pool */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {m && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 42, fontWeight: 700, lineHeight: 1 }}>
                <span style={{ color: YES }}>YES {yes}%</span>
                <span style={{ color: NO }}>{100 - yes}% NO</span>
              </div>
              <div
                style={{
                  display: "flex",
                  height: 40,
                  marginRight: 3,
                  border: `3px solid ${INK}`,
                  borderRadius: "22px 12px 20px 10px / 14px 20px 12px 22px",
                  overflow: "hidden",
                  boxShadow: `3px 3px 0 ${INK}`,
                  background: CARD,
                }}
              >
                <div style={{ width: `${o.yesPct}%`, backgroundImage: `repeating-linear-gradient(-45deg, ${YES} 0 10px, ${YES}8c 10px 16px)` }} />
                <div style={{ width: 3, background: INK }} />
                <div style={{ flex: 1, backgroundImage: `repeating-linear-gradient(45deg, ${NO} 0 10px, ${NO}8c 10px 16px)` }} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: MUTED, marginTop: 8 }}>
            <span>{m ? `Strike ${fmtUsd(m.strike)} · Pot ${fmtToken(o.total)} BnM · ${m.outcome ? outcomeLabel(m.outcome) : "Open"}` : ""}</span>
            <span>Base · Arbitrum · Ethereum via Chainlink CCIP</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Caveat", data: caveat, style: "normal", weight: 700 },
        { name: "Instrument Serif", data: serif, style: "normal", weight: 400 },
        { name: "Instrument Serif", data: serifItalic, style: "italic", weight: 400 },
        { name: "Inter", data: inter, style: "normal", weight: 400 },
        { name: "Inter", data: interBold, style: "normal", weight: 700 },
      ],
    },
  );
}
