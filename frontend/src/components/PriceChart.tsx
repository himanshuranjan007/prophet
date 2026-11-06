"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { HUB_CHAIN, Outcome, type Asset, type Market } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { useFeedHistory, type FeedRound } from "@/lib/hooks";

/* Live Chainlink price chart for a market.
   One series (the asset's Chainlink Data Feed rounds) drawn as a step line, because an
   oracle price holds until the next round. Annotations: strike reference line with YES/NO
   zones (washes + text labels, never colour alone), close-time marker, settlement round.
   Hover/keyboard crosshair + tooltip; sr-only table for the same data. */

const RANGES = [
  { key: "1H", sec: 3600 },
  { key: "6H", sec: 6 * 3600 },
  { key: "24H", sec: 24 * 3600 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const H = 240;
const M = { top: 26, right: 70, bottom: 26, left: 6 };
const LOW64 = (1n << 64n) - 1n;
const toNum = (p: bigint) => Number(p) / 1e8;

const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fullTime = (t: number) =>
  new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const ago = (t: number, now: number) => {
  const s = Math.max(0, now - t);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${(s / 3600).toFixed(1)}h ago`;
};
const usdTick = (v: number) =>
  "$" + v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : v >= 100 ? 1 : 2, minimumFractionDigits: v >= 1000 ? 0 : v >= 100 ? 1 : 2 });

function niceStep(raw: number) {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}
const TIME_STEPS = [300, 600, 900, 1800, 3600, 7200, 10800, 21600];

export function PriceChart({ asset, market, now }: { asset: Asset; market: Market; now: number }) {
  const [range, setRange] = useState<RangeKey>(asset.relay ? "24H" : "6H");
  const W = RANGES.find((r) => r.key === range)!.sec;

  const close = Number(market.closeTime);
  const resolved = market.outcome !== Outcome.Unresolved;
  const isOpen = !resolved && now > 0 && now < close;

  // ---------------------------------------------------------------- time window
  // Open: [now - W, close] (close pulled in to at most 30% future room). Closed: centred on close.
  let start: number;
  let end: number;
  if (isOpen) {
    start = now - W;
    end = Math.max(now + W * 0.04, Math.min(close + W * 0.04, now + W * 0.3));
  } else {
    end = Math.min(Math.max(now, close), close + W * 0.25);
    start = end - W;
  }
  // bucket to 5 min so the query key (and fetch) doesn't change every second
  const fromSec = now > 0 ? Math.floor(start / 300) * 300 : 0;

  const hist = useFeedHistory(asset.source.chainId, asset.source.feed, fromSec);
  const relayed = useFeedHistory(asset.relay ? HUB_CHAIN.id : undefined, asset.relay ? asset.feed : undefined, fromSec);

  const rounds = hist.data;
  const settle = useMemo(() => {
    if (!resolved || market.finalPrice <= 0n) return undefined;
    const series = asset.relay ? relayed.data : rounds;
    return series?.find((r) => r.t >= close) ?? { id: 0n, price: market.finalPrice, t: close };
  }, [resolved, market.finalPrice, asset.relay, relayed.data, rounds, close]);
  if (settle && settle.t > end) end = Math.min(Math.max(now, settle.t), settle.t + W * 0.05);

  // ---------------------------------------------------------------- size
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [active, setActive] = useState<number | null>(null);

  // ---------------------------------------------------------------- geometry
  const geo = useMemo(() => {
    if (!rounds?.length || width < 50 || now === 0) return null;
    const iw = width - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const strike = toNum(market.strike);
    const vis = rounds.filter((r, i) => r.t >= start || rounds[i + 1]?.t > start || i === rounds.length - 1);
    const prices = vis.map((r) => toNum(r.price)).concat(strike, settle ? [toNum(settle.price)] : []);
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    const pad = (hi - lo) * 0.14 || hi * 0.002;
    lo -= pad;
    hi += pad;
    const x = (t: number) => M.left + ((Math.min(Math.max(t, start), end) - start) / (end - start)) * iw;
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * ih;

    const pts = vis.map((r) => ({ r, x: x(r.t), y: y(toNum(r.price)) }));
    const lineEnd = x(isOpen ? now : Math.min(end, Math.max(now, close)));
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) d += `H${pts[i].x.toFixed(1)}V${pts[i].y.toFixed(1)}`;
    d += `H${lineEnd.toFixed(1)}`;
    const ys = y(strike);
    const area = `${d}V${ys.toFixed(1)}H${pts[0].x.toFixed(1)}Z`;

    const step = niceStep((hi - lo) / 4);
    const yTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
    const tStep = TIME_STEPS.find((s) => (end - start) / s <= 6) ?? 21600;
    const xTicks: number[] = [];
    for (let t = Math.ceil(start / tStep) * tStep; t <= end; t += tStep) xTicks.push(t);

    return { iw, ih, x, y, pts, d, area, ys, strike, yTicks, xTicks, lineEnd };
  }, [rounds, width, now, start, end, market.strike, settle, isOpen, close]);

  // ---------------------------------------------------------------- interaction
  const pick = (clientX: number) => {
    if (!geo || !wrap.current) return;
    const px = clientX - wrap.current.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < geo.pts.length; i++) if (Math.abs(geo.pts[i].x - px) < Math.abs(geo.pts[best].x - px)) best = i;
    setActive(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!geo) return;
    const last = geo.pts.length - 1;
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last + 1) - 1));
    else if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? -1) + 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };
  const act = geo && active !== null ? geo.pts[Math.min(active, geo.pts.length - 1)] : null;

  const latest = rounds?.[rounds.length - 1];
  const closeVisible = close >= start && close <= end;
  const label = `${asset.symbol}/USD Chainlink price, last ${range}`;

  return (
    <section aria-label={`${asset.symbol} price chart`} className="space-y-3">
      {/* filters: one row above the chart */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 text-sm">
          <span className="font-semibold">Chainlink {asset.symbol}/USD</span>
          <span className="text-muted">
            {latest && now > 0 ? <> · updated <span className="num">{ago(latest.t, now)}</span></> : null}
            <span className="hidden sm:inline"> · {asset.cadence}</span>
          </span>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => {
                setRange(r.key);
                setActive(null);
              }}
              className={`chip num px-2 py-0.5 text-xs transition-colors duration-(--dur-quick) ${range === r.key ? "bg-hl/50" : "hover:bg-ink/5"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={wrap}
        className={`relative select-none outline-none transition-opacity duration-(--dur-base) focus-visible:ring-2 focus-visible:ring-ink/40 ${hist.isPlaceholderData ? "opacity-60" : ""}`}
        style={{ height: H }}
        tabIndex={geo ? 0 : -1}
        role="group"
        aria-label={`${label}. Use arrow keys to read rounds.`}
        onKeyDown={onKey}
        onPointerMove={(e: PointerEvent) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        {!geo ? (
          <div className="skeleton h-full w-full" role="status">
            <span className="sr-only">Loading {asset.symbol} price history</span>
          </div>
        ) : (
          <svg width={width} height={H} className="block overflow-visible" aria-hidden>
            <defs>
              <clipPath id={`above-${asset.symbol}`}>
                <rect x={0} y={0} width={width} height={Math.max(0, geo.ys)} />
              </clipPath>
              <clipPath id={`below-${asset.symbol}`}>
                <rect x={0} y={geo.ys} width={width} height={Math.max(0, H - geo.ys)} />
              </clipPath>
            </defs>

            {/* recessive grid: solid hairlines */}
            {geo.yTicks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + geo.iw} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} />
                {/* skip tick labels that would collide with the strike label */}
                {Math.abs(geo.y(v) - geo.ys) > 22 && (
                  <text x={M.left + geo.iw + 8} y={geo.y(v) + 3.5} className="num fill-muted text-[11px]">
                    {usdTick(v)}
                  </text>
                )}
              </g>
            ))}
            {geo.xTicks.map((t) => (
              <text key={t} x={geo.x(t)} y={H - 6} textAnchor="middle" className="num fill-muted text-[11px]">
                {hhmm(t)}
              </text>
            ))}

            {/* YES / NO zones: washes between the price and the strike */}
            <path d={geo.area} fill="var(--yes)" fillOpacity={0.13} clipPath={`url(#above-${asset.symbol})`} />
            <path d={geo.area} fill="var(--no)" fillOpacity={0.13} clipPath={`url(#below-${asset.symbol})`} />

            {/* strike reference */}
            <line x1={M.left} x2={M.left + geo.iw} y1={geo.ys} y2={geo.ys} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="5 4" />
            <text x={M.left + geo.iw + 8} y={geo.ys - 6} className="fill-ink text-[11px] font-bold">
              strike
            </text>
            <text x={M.left + geo.iw + 8} y={geo.ys + 8} className="num fill-ink text-[11px]">
              {usdTick(geo.strike)}
            </text>
            <text x={M.left + 4} y={geo.ys - 6} className="fill-muted text-[11px] font-semibold">
              YES if above
            </text>
            <text x={M.left + 4} y={geo.ys + 15} className="fill-muted text-[11px] font-semibold">
              NO if below
            </text>

            {/* close marker */}
            {closeVisible ? (
              <g>
                <line x1={geo.x(close)} x2={geo.x(close)} y1={M.top - 6} y2={H - M.bottom} stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 4" />
                <text x={geo.x(close)} y={M.top - 10} textAnchor="middle" className="num fill-ink text-[11px] font-bold">
                  close {hhmm(close)}
                </text>
              </g>
            ) : (
              close > end && (
                <text x={M.left + geo.iw} y={M.top - 10} textAnchor="end" className="num fill-muted text-[11px] font-semibold">
                  closes {hhmm(close)} →
                </text>
              )
            )}

            {/* relayed-to-Base ticks (SOL): when each price reached the hub over CCIP */}
            {asset.relay &&
              relayed.data
                ?.filter((r) => r.t >= start && r.t <= end)
                .map((r) => <line key={String(r.id)} x1={geo.x(r.t)} x2={geo.x(r.t)} y1={H - M.bottom} y2={H - M.bottom - 6} stroke="var(--ink)" strokeWidth={1.5} />)}

            {/* the price */}
            <path d={geo.d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {/* live end-dot */}
            {isOpen && (
              <g>
                <circle
                  cx={geo.lineEnd}
                  cy={geo.pts[geo.pts.length - 1].y}
                  r={7}
                  fill="var(--ink)"
                  opacity={0.18}
                  className="animate-ping [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden"
                />
                <circle cx={geo.lineEnd} cy={geo.pts[geo.pts.length - 1].y} r={4} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
              </g>
            )}

            {/* settlement round */}
            {settle && (
              <g>
                <circle cx={geo.x(settle.t)} cy={geo.y(toNum(settle.price))} r={5} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
                <text
                  x={geo.x(settle.t)}
                  y={geo.y(toNum(settle.price)) - 10}
                  textAnchor={geo.x(settle.t) > M.left + geo.iw - 60 ? "end" : "middle"}
                  className="num fill-ink text-[11px] font-bold"
                >
                  settled {usdTick(toNum(settle.price))}
                </text>
              </g>
            )}

            {/* crosshair */}
            {act && (
              <g>
                <line x1={act.x} x2={act.x} y1={M.top} y2={H - M.bottom} stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1} />
                <circle cx={act.x} cy={act.y} r={4} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}

        {act && geo && (
          <div
            className="card pointer-events-none absolute top-1 z-10 px-3 py-2 text-xs shadow-(--shadow-sm)"
            style={{ left: Math.min(Math.max(act.x - 70, 0), width - 150), width: 150 }}
            role="status"
          >
            <div className="num text-sm font-bold">{fmtUsd(act.r.price)}</div>
            <div className="num text-muted">{fullTime(act.r.t)}</div>
            <div className="num text-muted">round {(act.r.id & LOW64).toLocaleString()}</div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Step line = each Chainlink round.{" "}
        {asset.relay ? "Ticks on the time axis mark prices relayed to Base over CCIP. " : ""}
        {resolved ? "The dot marks the round that settled this market." : "The market settles on the first round after close."}
      </p>

      {rounds && <RoundsTable rounds={rounds.slice(-30)} symbol={asset.symbol} />}
    </section>
  );
}

function RoundsTable({ rounds, symbol }: { rounds: FeedRound[]; symbol: string }) {
  return (
    <table className="sr-only">
      <caption>Latest Chainlink {symbol}/USD rounds</caption>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Price</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((r) => (
          <tr key={String(r.id)}>
            <td>{fullTime(r.t)}</td>
            <td>{fmtUsd(r.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
