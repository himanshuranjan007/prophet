import type { Market } from "@/lib/config";
import { fmtToken, odds } from "@/lib/format";

export function PoolBar({ market, big = false }: { market: Pick<Market, "yesPool" | "noPool">; big?: boolean }) {
  const o = odds(market);
  return (
    <div>
      <div className={`flex justify-between ${big ? "text-sm" : "text-xs"} mb-1.5`}>
        <span className="font-medium text-yes">
          YES {o.yesPct.toFixed(0)}%{o.yesMult ? ` · ${o.yesMult.toFixed(2)}x` : ""}
        </span>
        <span className="font-medium text-no">
          {o.noMult ? `${o.noMult.toFixed(2)}x · ` : ""}
          {o.noPct.toFixed(0)}% NO
        </span>
      </div>
      <div className={`flex overflow-hidden rounded-full bg-line ${big ? "h-3" : "h-2"}`}>
        <div className="bg-yes transition-all" style={{ width: `${o.yesPct}%` }} />
        <div className="bg-no transition-all" style={{ width: `${o.noPct}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-muted">
        {fmtToken(market.yesPool)} YES · {fmtToken(market.noPool)} NO · pool {fmtToken(o.total)} CCIP-BnM
      </div>
    </div>
  );
}
