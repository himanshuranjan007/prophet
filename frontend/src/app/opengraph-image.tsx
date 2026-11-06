import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Prophet: call it from any chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// "ink on paper" tokens (light theme, see globals.css)
const PAPER = "#fbf6ea";
const DOT = "#e8dfc8";
const INK = "#221f1a";
const MUTED = "#6e675a";
const YES = "#16652b";
const NO = "#ec6432";
const HL = "#ffd43b";

const CHAINS = [
  { name: "Base", color: "#3b82f6" },
  { name: "Arbitrum", color: "#14b8a6" },
  { name: "Ethereum", color: "#a78bfa" },
];

const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

const [caveat, serif, serifItalic, inter, interBold] = await Promise.all([
  font("caveat", "caveat-latin-700-normal.woff"),
  font("instrument-serif", "instrument-serif-latin-400-normal.woff"),
  font("instrument-serif", "instrument-serif-latin-400-italic.woff"),
  font("inter", "inter-latin-400-normal.woff"),
  font("inter", "inter-latin-700-normal.woff"),
]);

const marker = `linear-gradient(transparent 52%, ${HL}d9 52%, ${HL}b3 88%, transparent 88%)`;

/** Satori lays spans out as flex items, so the subtitle is two fixed lines of word groups. */
type Run = { t: string; c?: string; b?: boolean };
const words = (line: string): Run[][] => line.split(" ").map((t) => [{ t }]);
const SUBTITLE: Run[][][] = [
  [[{ t: "Bet" }], [{ t: "YES", c: YES, b: true }, { t: "/" }, { t: "NO", c: NO, b: true }], ...words("from Base, Arbitrum or Ethereum")],
  words("One pool via Chainlink CCIP, settled by Chainlink Data Feeds"),
];

export default function Image() {
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
          padding: "52px 64px 56px",
          fontFamily: "Inter",
        }}
      >
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="60" height="60" viewBox="0 0 48 48">
            <path fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M24 5.5c9.6-.4 16.9 6.7 16.6 15.6-.3 8.6-7.4 15.3-16.4 15.2C15 36.2 7.6 29.4 7.6 20.7 7.7 12.4 14.6 5.9 24 5.5z" />
            <path fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.6" d="M14.5 15.5c1.4-3.3 4.4-5.6 8-6.2" />
            <path fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M13 36.8c-1.5 1.7-2.6 3.6-3 5.6 9.4.9 19.1.8 28.4-.2-.5-2-1.6-3.8-3.2-5.4" />
            <path fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" d="M9.5 42.6c9.8 1.2 19.6 1.1 29.2-.3" />
            <path fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" d="M27.5 17.2l1.3 3.4 3.4 1.1-3.4 1.3-1.2 3.5-1.3-3.5-3.4-1.2 3.4-1.2z" />
          </svg>
          <span style={{ fontFamily: "Caveat", fontSize: 58, lineHeight: 1 }}>Prophet</span>
        </div>

        {/* headline + subtitle */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Instrument Serif", fontSize: 136, lineHeight: 1, letterSpacing: -1.5 }}>
            <span>Call it.</span>
            <div style={{ display: "flex" }}>
              <span style={{ backgroundImage: marker, padding: "0 16px 0 6px", marginLeft: -6, fontStyle: "italic" }}>from any chain.</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 30, fontSize: 30, lineHeight: 1.4, color: MUTED }}>
            {SUBTITLE.map((line, i) => (
              <div key={i} style={{ display: "flex", columnGap: 8 }}>
                {line.map((word, j) => (
                  <div key={j} style={{ display: "flex" }}>
                    {word.map((r, k) => (
                      <span key={k} style={{ color: r.c, fontWeight: r.b ? 700 : 400 }}>
                        {r.t}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* chains */}
        <div style={{ display: "flex", alignItems: "center", gap: 36, fontSize: 30, fontWeight: 700 }}>
          {CHAINS.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="30" height="30" viewBox="0 0 14 14">
                <path
                  d="M7 1.2c3.4-.2 5.9 2.4 5.7 5.6-.2 3.3-2.8 5.6-5.9 5.4C3.6 12 1.2 9.6 1.4 6.6 1.6 3.6 3.9 1.4 7 1.2z"
                  fill={c.color}
                  stroke={INK}
                  strokeWidth="1.1"
                />
              </svg>
              <span>{c.name}</span>
            </div>
          ))}
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
