import type { Market } from "@/lib/config";
import { fmtToken, odds } from "@/lib/format";

/** Two hatched marker strokes inside a pen outline. */
export function PoolBar({ market, big = false }: { market: Pick<Market, "yesPool" | "noPool">; big?: boolean }) {
  const o = odds(market);
  const yesPct = o.yesPct.toFixed(0);
  const noPct = o.noPct.toFixed(0);
  return (
    <div>
      <div className={`mb-2 flex items-baseline justify-between gap-3 ${big ? "text-lg" : "text-base"}`}>
        <span className="num font-bold text-yes">
          YES {yesPct}%
          {o.yesMult ? (
            <span className="num hidden text-sm font-normal text-muted sm:inline"> · pays {o.yesMult.toFixed(2)}x</span>
          ) : null}
        </span>
        <span className="num text-right font-bold text-no">
          {o.noMult ? (
            <span className="num hidden text-sm font-normal text-muted sm:inline">pays {o.noMult.toFixed(2)}x · </span>
          ) : null}
          {noPct}% NO
        </span>
      </div>
      <div
        className={`sketch-thin flex overflow-hidden bg-card ${big ? "h-4" : "h-3"}`}
        role="img"
        aria-label={`Pool split: YES ${yesPct}%, NO ${noPct}%`}
      >
        <div
          className="hatch-yes transition-[width] duration-(--dur-slow) ease-(--ease-ink) motion-reduce:transition-none"
          style={{ width: `${o.yesPct}%` }}
        />
        <div className="w-[1.5px] shrink-0 bg-ink" />
        <div className="hatch-no flex-1" />
      </div>
      <div className="num mt-2 text-xs text-muted">
        {fmtToken(o.total)} BnM pooled · {fmtToken(market.yesPool)} YES · {fmtToken(market.noPool)} NO
      </div>
    </div>
  );
}
