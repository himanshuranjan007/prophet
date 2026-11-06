"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { HUB_CHAIN, Outcome, type Asset, type Market } from "@/lib/config";
import { fmtUsd } from "@/lib/format";
import { useFeedHistory, type FeedRound } from "@/lib/hooks";

/* Live Chainlink price chart for a market.
   One series (the asset's Chainlink Data Feed rounds) drawn as a step line: an oracle price
   holds until the next round. While the market is open the chart is live: time flows
   continuously (rAF clock), the held price extends to "now", each new round draws itself in
   with a ripple, and a price tag rides the head. Annotations: strike line with YES/NO zones
   (washes + text labels, never colour alone), close marker, settlement round. Hover/keyboard
   crosshair + tooltip; sr-only table of the same data. */

const RANGES = [
  { key: "LIVE", sec: 30 * 60, live: true },
  { key: "1H", sec: 3600, live: false },
  { key: "6H", sec: 6 * 3600, live: false },
  { key: "24H", sec: 24 * 3600, live: false },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const H = 240;
const M = { top: 26, right: 78, bottom: 26, left: 6 };
const LOW64 = (1n << 64n) - 1n;
const toNum = (p: bigint) => Number(p) / 1e8;

const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fullTime = (t: number) =>
  new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dur = (s: number) => (s < 90 ? `${Math.max(0, Math.round(s))}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);
const usdTick = (v: number) => {
  const dp = v >= 1000 ? 0 : v >= 100 ? 1 : 2;
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });
};

function niceStep(raw: number) {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}
const TIME_STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600];

/** Float seconds driven by requestAnimationFrame (~30fps) while `on`; otherwise the 1s clock. */
function useSmoothNow(on: boolean, fallback: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= 33) {
        last = ts;
        setT(Date.now() / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return on && t > 0 ? t : fallback;
}

export function PriceChart({ asset, market, now }: { asset: Asset; market: Market; now: number }) {
  const close = Number(market.closeTime);
  const resolved = market.outcome !== Outcome.Unresolved;
  const isOpen = !resolved && now > 0 && now < close;

  // user's pick wins; otherwise LIVE for open markets (24H for slow relayed feeds), 6H after close
  const [picked, setPicked] = useState<RangeKey | null>(null);
  const fallback: RangeKey = isOpen ? (asset.relay ? "24H" : "LIVE") : "6H";
  const range = picked && (picked !== "LIVE" || isOpen) ? picked : fallback;
  const R = RANGES.find((r) => r.key === range)!;
  const W = R.sec;
  const live = isOpen; // the clock flows on every range while betting is open

  const t = useSmoothNow(live, now);

  // ---------------------------------------------------------------- time window
  let start: number;
  let end: number;
  if (isOpen && R.live) {
    end = t + W * 0.02; // "now" pinned near the right edge: the chart scrolls
    start = end - W;
  } else if (isOpen) {
    start = t - W; // close pulled in (max 30% future room) so you can see time running out
    end = Math.max(t + W * 0.04, Math.min(close + W * 0.04, t + W * 0.3));
  } else {
    end = Math.min(Math.max(now, close), close + W * 0.25);
    start = end - W;
  }
  // bucket to 5 min so the query key (and fetch) doesn't change every frame
  const fromSec = now > 0 ? Math.floor(start / 300) * 300 : 0;
  // closed markets read a bounded window (so an old market never walks to today's rounds)
  const toSec = isOpen || now === 0 ? undefined : Math.ceil((end + W * 0.05) / 300) * 300;
  const poll = isOpen && R.live ? 5_000 : 15_000;

  const hist = useFeedHistory(asset.source.chainId, asset.source.feed, fromSec, poll, toSec);
  const relayed = useFeedHistory(asset.relay ? HUB_CHAIN.id : undefined, asset.relay ? asset.feed : undefined, fromSec, 15_000, toSec);

  const settle = useMemo(() => {
    if (!resolved || market.finalPrice <= 0n) return undefined;
    const series = asset.relay ? relayed.data : hist.data;
    // trust the series only if it straddles close and agrees with the price the hub stored
    const r = series && series[0]?.t < close ? series.find((x) => x.t >= close) : undefined;
    return r && r.price === market.finalPrice ? r : { id: 0n, price: market.finalPrice, t: close };
  }, [resolved, market.finalPrice, asset.relay, relayed.data, hist.data, close]);
  if (settle && !isOpen && settle.t > end) end = Math.min(Math.max(now, settle.t), settle.t + W * 0.05);

  // never draw rounds past the window's end (they'd pile up at the right edge)
  const rounds = useMemo(() => {
    const d = hist.data;
    if (!d?.length) return d;
    const inWin = d.filter((r) => r.t <= end);
    return inWin.length ? inWin : d.slice(0, 1);
  }, [hist.data, end]);

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

  // ---------------------------------------------------------------- y domain (only changes with data)
  const ydom = useMemo(() => {
    if (!rounds?.length) return null;
    const strike = toNum(market.strike);
    const vis = rounds.filter((r, i) => r.t >= fromSec || rounds[i + 1]?.t > fromSec || i === rounds.length - 1);
    const prices = vis.map((r) => toNum(r.price)).concat(strike, settle ? [toNum(settle.price)] : []);
    const mn = Math.min(...prices);
    const mx = Math.max(...prices);
    const span = mx - mn || mx * 0.004;
    // snap to tick steps so small moves don't rescale the axis (no jitter while live)
    const step = niceStep(span / 3.5);
    const lo = Math.floor((mn - span * 0.08) / step) * step;
    const hi = Math.ceil((mx + span * 0.08) / step) * step;
    const yTicks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(+v.toFixed(8));
    return { lo, hi, yTicks, strike };
  }, [rounds, fromSec, market.strike, settle]);

  // ---------------------------------------------------------------- geometry (cheap; recomputed per frame while live)
  const geo = useMemo(() => {
    if (!rounds?.length || !ydom || width < 50 || now === 0) return null;
    const iw = width - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const { lo, hi } = ydom;
    const x = (tt: number) => M.left + ((Math.min(Math.max(tt, start), end) - start) / (end - start)) * iw;
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * ih;

    const vis = rounds.filter((r, i) => r.t >= start || rounds[i + 1]?.t > start || i === rounds.length - 1);
    const pts = vis.map((r) => ({ r, x: x(r.t), y: y(toNum(r.price)) }));
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : undefined;

    // body = every step up to the latest round's x (its vertical is drawn separately, animated)
    let body = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) body += `H${pts[i].x.toFixed(1)}V${pts[i].y.toFixed(1)}`;
    if (prev) body += `H${last.x.toFixed(1)}`;
    const headX = x(isOpen ? t : Math.min(end, Math.max(now, close)));
    const ys = y(ydom.strike);
    // full line (for the zone washes)
    const area = `${body}${prev ? `V${last.y.toFixed(1)}` : ""}H${headX.toFixed(1)}V${ys.toFixed(1)}H${pts[0].x.toFixed(1)}Z`;

    const tStep = TIME_STEPS.find((s) => (end - start) / s <= 6) ?? 21600;
    const xTicks: number[] = [];
    for (let tt = Math.ceil(start / tStep) * tStep; tt <= end; tt += tStep) xTicks.push(tt);

    return { iw, ih, x, y, pts, last, prev, body, area, headX, ys, xTicks };
  }, [rounds, ydom, width, now, start, end, isOpen, t, close]);

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
    const lastI = geo.pts.length - 1;
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? lastI + 1) - 1));
    else if (e.key === "ArrowRight") setActive((a) => Math.min(lastI, (a ?? -1) + 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(lastI);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };
  const act = geo && active !== null ? geo.pts[Math.min(active, geo.pts.length - 1)] : null;

  const latest = rounds?.[rounds.length - 1];
  const sinceLast = latest && now > 0 ? now - latest.t : undefined;
  const nextIn = latest && now > 0 ? latest.t + asset.heartbeat - now : undefined;
  const closeVisible = close >= start && close <= end;
  const lastKey = latest ? String(latest.id) : "none";

  return (
    <section aria-label={`${asset.symbol} price chart`} className="space-y-3">
      {/* filters: one row above the chart */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {isOpen && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide" aria-label="Live">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-ink opacity-40 motion-reduce:hidden" />
                <span className="relative h-2 w-2 rounded-full bg-ink" />
              </span>
              LIVE
            </span>
          )}
          <span className="font-semibold">Chainlink {asset.symbol}/USD</span>
          <span className="truncate text-muted">
            {sinceLast !== undefined && (
              <>
                {" "}
                · updated <span className="num">{dur(sinceLast)}</span> ago
              </>
            )}
            {isOpen && nextIn !== undefined && (
              <span className="hidden sm:inline">
                {" "}
                · next {nextIn > 0 ? <>within <span className="num">{dur(nextIn)}</span></> : "due any moment"}
              </span>
            )}
          </span>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Time range">
          {RANGES.filter((r) => !r.live || isOpen).map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => {
                setPicked(r.key);
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
        aria-label={`${asset.symbol}/USD Chainlink price, ${range === "LIVE" ? "last 30 minutes, live" : `last ${range}`}. Use arrow keys to read rounds.`}
        onKeyDown={onKey}
        onPointerMove={(e: PointerEvent) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        {!geo || !ydom ? (
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
              <clipPath id={`plot-${asset.symbol}`}>
                <rect x={M.left} y={0} width={geo.iw} height={H} />
              </clipPath>
            </defs>

            {/* recessive grid: solid hairlines */}
            {ydom.yTicks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + geo.iw} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} />
                {(!isOpen || Math.abs(geo.y(v) - geo.last.y) > 14) && (
                  <text x={M.left + geo.iw + 10} y={geo.y(v) + 3.5} className="num fill-muted text-[11px]">
                    {usdTick(v)}
                  </text>
                )}
              </g>
            ))}

            {/* sliding time axis */}
            <g clipPath={`url(#plot-${asset.symbol})`}>
              {geo.xTicks.map((tt) => (
                <text key={tt} x={geo.x(tt)} y={H - 6} textAnchor="middle" className="num fill-muted text-[11px]">
                  {hhmm(tt)}
                </text>
              ))}
            </g>

            <g clipPath={`url(#plot-${asset.symbol})`}>
              {/* YES / NO zones: washes between the price and the strike */}
              <path d={geo.area} fill="var(--yes)" fillOpacity={0.13} clipPath={`url(#above-${asset.symbol})`} />
              <path d={geo.area} fill="var(--no)" fillOpacity={0.13} clipPath={`url(#below-${asset.symbol})`} />

              {/* strike reference */}
              <line x1={M.left} x2={M.left + geo.iw} y1={geo.ys} y2={geo.ys} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="5 4" />

              {/* close marker */}
              {closeVisible && (
                <line x1={geo.x(close)} x2={geo.x(close)} y1={M.top - 6} y2={H - M.bottom} stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 4" />
              )}

              {/* relayed-to-Base ticks (SOL): when each price reached the hub over CCIP */}
              {asset.relay &&
                relayed.data
                  ?.filter((r) => r.t >= start && r.t <= end)
                  .map((r) => <line key={String(r.id)} x1={geo.x(r.t)} x2={geo.x(r.t)} y1={H - M.bottom} y2={H - M.bottom - 6} stroke="var(--ink)" strokeWidth={1.5} />)}

              {/* the price: settled steps, then the latest step (draws itself in), then the held price to now */}
              <path d={geo.body} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {geo.prev && (
                <path
                  key={`step-${lastKey}`}
                  d={`M${geo.last.x.toFixed(1)} ${geo.prev.y.toFixed(1)}V${geo.last.y.toFixed(1)}`}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  pathLength={1}
                  className="chart-pen"
                />
              )}
              <line x1={geo.last.x} x2={geo.headX} y1={geo.last.y} y2={geo.last.y} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />

              {/* new-round ripple at the step */}
              {isOpen && (
                <circle key={`ripple-${lastKey}`} cx={geo.last.x} cy={geo.last.y} r={4} fill="none" stroke="var(--ink)" strokeWidth={1.5} className="chart-ripple" />
              )}
            </g>

            {/* strike + zone labels on the left, clear of the live price tag in the right gutter */}
            <text x={M.left + 4} y={geo.ys - 6} className="fill-muted text-[11px] font-semibold" stroke="var(--paper)" strokeWidth={4} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
              <tspan className="num fill-ink font-bold">strike {usdTick(ydom.strike)}</tspan> · YES if above
            </text>
            <text x={M.left + 4} y={geo.ys + 15} className="fill-muted text-[11px] font-semibold" stroke="var(--paper)" strokeWidth={4} strokeLinejoin="round" style={{ paintOrder: "stroke" }}>
              NO if below
            </text>
            {closeVisible ? (
              <text x={geo.x(close)} y={M.top - 10} textAnchor="middle" className="num fill-ink text-[11px] font-bold">
                close {hhmm(close)}
              </text>
            ) : (
              close > end && (
                <text x={M.left + geo.iw} y={M.top - 10} textAnchor="end" className="num fill-muted text-[11px] font-semibold">
                  closes {hhmm(close)} →
                </text>
              )
            )}

            {/* live head: dot glides with the price; tag rides in the right gutter */}
            {isOpen && (
              <>
                <g className="chart-glide" style={{ transform: `translate(${geo.headX}px, ${geo.last.y}px)` }}>
                  <circle r={7} fill="var(--ink)" opacity={0.18} className="animate-ping [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden" />
                  <circle r={4} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
                </g>
                <g className="chart-glide" style={{ transform: `translate(${M.left + geo.iw + 6}px, ${geo.last.y}px)` }}>
                  <rect x={0} y={-10} width={M.right - 8} height={20} rx={4} fill="var(--ink)" />
                  <text x={(M.right - 8) / 2} y={4} textAnchor="middle" className="num fill-on-ink text-[11px] font-bold">
                    {usdTick(toNum(geo.last.r.price))}
                  </text>
                </g>
              </>
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
                  stroke="var(--paper)" strokeWidth={4} strokeLinejoin="round" style={{ paintOrder: "stroke" }}
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
            style={{ left: Math.min(Math.max(act.x - 80, 0), width - 160), width: 160 }}
            role="status"
          >
            <div className="num text-sm font-bold">{fmtUsd(act.r.price)}</div>
            <div className="num text-muted">{fullTime(act.r.t)}</div>
            <div className="num text-muted">round {(act.r.id & LOW64).toLocaleString()}</div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Each step is a Chainlink round; the line holds that price until the next one{isOpen ? " (live)" : ""}.{" "}
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
