"use client";

import type { Asset } from "@/lib/config";
import { useFeedHistory } from "@/lib/hooks";

/** Tiny step line of the last `hours` of Chainlink rounds (+ optional strike hairline). Decorative:
 *  the exact numbers live in the card/hero text, so this is aria-hidden. */
export function Sparkline({
  asset,
  now,
  hours = 6,
  strike,
  className,
}: {
  asset: Asset;
  now: number;
  hours?: number;
  strike?: bigint;
  className?: string;
}) {
  const from = now > 0 ? Math.floor((now - hours * 3600) / 300) * 300 : 0;
  const { data } = useFeedHistory(asset.source.chainId, asset.source.feed, from);
  const VW = 240;
  const VH = 40;

  if (!data?.length || now === 0) return <div className={`h-10 ${className ?? ""}`} aria-hidden />;

  const start = now - hours * 3600;
  const vals = data.map((r) => Number(r.price) / 1e8);
  const s = strike !== undefined ? Number(strike) / 1e8 : undefined;
  let lo = Math.min(...vals, ...(s !== undefined ? [s] : []));
  let hi = Math.max(...vals, ...(s !== undefined ? [s] : []));
  const pad = (hi - lo) * 0.12 || hi * 0.002;
  lo -= pad;
  hi += pad;
  const x = (t: number) => ((Math.max(t, start) - start) / (now - start)) * VW;
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * VH;

  let d = `M${x(data[0].t).toFixed(1)} ${y(vals[0]).toFixed(1)}`;
  for (let i = 1; i < data.length; i++) d += `H${x(data[i].t).toFixed(1)}V${y(vals[i]).toFixed(1)}`;
  d += `H${VW}`;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className={`block h-10 w-full overflow-visible ${className ?? ""}`} aria-hidden>
      {s !== undefined && (
        <line x1={0} x2={VW} y1={y(s)} y2={y(s)} stroke="var(--ink)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** % change over the window, from the first round in range to the latest. */
export function useChange(asset: Asset, now: number, hours = 24) {
  const from = now > 0 ? Math.floor((now - hours * 3600) / 300) * 300 : 0;
  const { data } = useFeedHistory(asset.source.chainId, asset.source.feed, from);
  if (!data || data.length < 2) return undefined;
  const a = Number(data[0].price);
  const b = Number(data[data.length - 1].price);
  return ((b - a) / a) * 100;
}
