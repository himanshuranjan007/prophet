import { Outcome, type Market } from "@/lib/config";
import { fmtToken, odds } from "@/lib/format";

const DIM = { filter: "grayscale(1)", opacity: 0.35 } as const;

/** Two hatched marker strokes inside a pen outline. Given a resolved market, the losing side (both, if
 *  void) fades to grey and the "pays" multipliers drop away, since the pool is final. */
export function PoolBar({
  market,
  big = false,
}: {
  market: Pick<Market, "yesPool" | "noPool"> & { outcome?: number };
  big?: boolean;
}) {
  const o = odds(market);
  const yesPct = o.yesPct.toFixed(0);
  const noPct = o.noPct.toFixed(0);
  const resolved = market.outcome !== undefined && market.outcome !== Outcome.Unresolved;
  const dimYes = market.outcome === Outcome.No || market.outcome === Outcome.Invalid;
  const dimNo = market.outcome === Outcome.Yes || market.outcome === Outcome.Invalid;
  const result = !resolved ? "" : dimYes && dimNo ? ", void" : dimNo ? ", YES won" : ", NO won";
  return (
    <div>
      <div className={`mb-2 flex items-baseline justify-between gap-3 ${big ? "text-lg" : "text-base"}`}>
        <span className={`num font-bold ${dimYes ? "text-muted" : "text-yes"}`}>
          YES {yesPct}%
          {!resolved && o.yesMult ? (
            <span className="num hidden text-sm font-normal text-muted sm:inline"> · pays {o.yesMult.toFixed(2)}x</span>
          ) : null}
        </span>
        <span className={`num text-right font-bold ${dimNo ? "text-muted" : "text-no"}`}>
          {!resolved && o.noMult ? (
            <span className="num hidden text-sm font-normal text-muted sm:inline">pays {o.noMult.toFixed(2)}x · </span>
          ) : null}
          {noPct}% NO
        </span>
      </div>
      <div
        className={`sketch-thin flex overflow-hidden bg-card ${big ? "h-4" : "h-3"}`}
        role="img"
        aria-label={`Pool split: YES ${yesPct}%, NO ${noPct}%${result}`}
      >
        <div
          className="hatch-yes transition-[width] duration-(--dur-slow) ease-(--ease-ink) motion-reduce:transition-none"
          style={{ width: `${o.yesPct}%`, ...(dimYes ? DIM : {}) }}
        />
        <div className="w-[1.5px] shrink-0 bg-ink" />
        <div className="hatch-no flex-1" style={dimNo ? DIM : undefined} />
      </div>
      <div className="num mt-2 text-xs text-muted">
        {fmtToken(o.total)} BnM pooled · {fmtToken(market.yesPool)} YES · {fmtToken(market.noPool)} NO
      </div>
    </div>
  );
}
