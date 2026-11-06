import type { Market } from "@/lib/config";
import { fmtToken, odds } from "@/lib/format";

/** Two hatched marker strokes inside a wobbly pen outline. */
export function PoolBar({ market, big = false }: { market: Pick<Market, "yesPool" | "noPool">; big?: boolean }) {
  const o = odds(market);
  return (
    <div>
      <div className={`mb-1.5 flex justify-between font-hand ${big ? "text-xl" : "text-lg"}`}>
        <span className="text-yes">
          YES {o.yesPct.toFixed(0)}%{o.yesMult ? <span className="text-muted"> · pays {o.yesMult.toFixed(2)}x</span> : null}
        </span>
        <span className="text-no">
          {o.noMult ? <span className="text-muted">pays {o.noMult.toFixed(2)}x · </span> : null}
          {o.noPct.toFixed(0)}% NO
        </span>
      </div>
      <div className={`sketch flex overflow-hidden bg-card ${big ? "h-6" : "h-4"}`}>
        <div className="hatch-yes transition-all duration-500" style={{ width: `${o.yesPct}%` }} />
        <div className="w-[2px] shrink-0 bg-ink" />
        <div className="hatch-no flex-1 transition-all duration-500" />
      </div>
      <div className="mt-1.5 font-hand text-base text-muted">
        {fmtToken(market.yesPool)} on YES · {fmtToken(market.noPool)} on NO · pot {fmtToken(o.total)} BnM
      </div>
    </div>
  );
}
