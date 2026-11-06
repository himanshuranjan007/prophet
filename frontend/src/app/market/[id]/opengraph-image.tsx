import { ImageResponse } from "next/og";
import { getMarket } from "@/lib/server";
import { fmtToken, fmtUsd, odds, outcomeLabel } from "@/lib/format";

export const alt = "Crosscall prediction market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = /^\d{1,9}$/.test(id) ? await getMarket(id) : null;
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
          background: "#0b0b10",
          color: "#ececf1",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, color: "#8b8b9a" }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 10, background: "#4c6fff", color: "white", alignItems: "center", justifyContent: "center" }}>
            C
          </div>
          Crosscall · bet from any chain
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>{m?.question ?? "Market not found"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 40, fontWeight: 700 }}>
            <span style={{ color: "#22c55e" }}>YES {o.yesPct.toFixed(0)}%</span>
            <span style={{ color: "#f05252" }}>{o.noPct.toFixed(0)}% NO</span>
          </div>
          <div style={{ display: "flex", height: 28, borderRadius: 14, overflow: "hidden", background: "#262633" }}>
            <div style={{ width: `${o.yesPct}%`, background: "#22c55e" }} />
            <div style={{ width: `${o.noPct}%`, background: "#f05252" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#8b8b9a" }}>
            <span>
              {m ? `Strike ${fmtUsd(m.strike)} · pool ${fmtToken(o.total)} · ${m.outcome ? outcomeLabel(m.outcome) : "open"}` : ""}
            </span>
            <span>Base · Arbitrum · Ethereum via Chainlink CCIP</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
