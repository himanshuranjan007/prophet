import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getMarket } from "@/lib/server";
import { fmtToken, fmtUsd, odds, outcomeLabel } from "@/lib/format";

export const alt = "Prophet prediction market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#fbf5e6";
const INK = "#23201b";
const YES = "#2f9e44";
const NO = "#e03131";
const HL = "#ffd43b";
const BLUE = "#2b59c3";

const font = (pkg: string, file: string) => readFile(join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [m, caveat, patrick] = await Promise.all([
    /^\d{1,9}$/.test(id) ? getMarket(id) : Promise.resolve(null),
    font("caveat", "caveat-latin-700-normal.woff"),
    font("patrick-hand", "patrick-hand-latin-400-normal.woff"),
  ]);
  const o = m ? odds(m) : { yesPct: 50, noPct: 50, total: 0n };

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
          backgroundImage: "radial-gradient(#e2d7bc 2px, transparent 2.5px)",
          backgroundSize: "34px 34px",
          color: INK,
          padding: "52px 64px",
          fontFamily: "Patrick",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34 }}>
          <svg width="56" height="56" viewBox="0 0 48 48">
            <path fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinecap="round" d="M24 5.5c9.6-.4 16.9 6.7 16.6 15.6-.3 8.6-7.4 15.3-16.4 15.2C15 36.2 7.6 29.4 7.6 20.7 7.7 12.4 14.6 5.9 24 5.5z" />
            <path fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinecap="round" d="M13 36.8c-1.5 1.7-2.6 3.6-3 5.6 9.4.9 19.1.8 28.4-.2-.5-2-1.6-3.8-3.2-5.4M9.5 42.6c9.8 1.2 19.6 1.1 29.2-.3" />
            <path fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinejoin="round" d="M27.5 17.2l1.3 3.4 3.4 1.1-3.4 1.3-1.2 3.5-1.3-3.5-3.4-1.2 3.4-1.2z" />
          </svg>
          <span style={{ fontFamily: "Caveat", fontSize: 54 }}>Prophet</span>
          <span style={{ color: "#736b5c", marginLeft: 6 }}>· call it from any chain</span>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Caveat",
            fontSize: 92,
            lineHeight: 1.02,
            transform: "rotate(-1.2deg)",
            backgroundImage: `linear-gradient(transparent 58%, ${HL}cc 58%, ${HL}aa 90%, transparent 90%)`,
            paddingRight: 12,
          }}
        >
          {m?.question ?? "Market not found"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 50, fontFamily: "Caveat" }}>
            <span style={{ color: YES }}>YES {o.yesPct.toFixed(0)}%</span>
            <span style={{ color: NO }}>{o.noPct.toFixed(0)}% NO</span>
          </div>
          <div
            style={{
              display: "flex",
              height: 40,
              border: `4px solid ${INK}`,
              borderRadius: "255px 18px 225px 16px / 16px 225px 18px 255px",
              overflow: "hidden",
              boxShadow: `6px 7px 0 ${INK}`,
              background: "#fffdf6",
            }}
          >
            <div style={{ width: `${o.yesPct}%`, backgroundImage: `repeating-linear-gradient(-45deg, ${YES} 0 10px, ${YES}88 10px 16px)` }} />
            <div style={{ width: 4, background: INK }} />
            <div style={{ flex: 1, backgroundImage: `repeating-linear-gradient(45deg, ${NO} 0 10px, ${NO}88 10px 16px)` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#736b5c", marginTop: 6 }}>
            <span>{m ? `strike ${fmtUsd(m.strike)} · pot ${fmtToken(o.total)} · ${m.outcome ? outcomeLabel(m.outcome) : "open"}` : ""}</span>
            <span>Base · Arbitrum · Ethereum via Chainlink CCIP</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Caveat", data: caveat, style: "normal", weight: 700 },
        { name: "Patrick", data: patrick, style: "normal", weight: 400 },
      ],
    },
  );
}
