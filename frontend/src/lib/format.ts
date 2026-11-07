import { formatUnits } from "viem";
import { FEED_DECIMALS, Outcome, type Market } from "./config";

export const fmtToken = (v: bigint, dp = 3) => {
  const n = Number(formatUnits(v, 18));
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
};

export const fmtUsd = (v: bigint) =>
  "$" + Number(formatUnits(v, FEED_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function odds(m: Pick<Market, "yesPool" | "noPool">) {
  const total = m.yesPool + m.noPool;
  const yesPct = total === 0n ? 50 : Number((m.yesPool * 10000n) / total) / 100;
  // parimutuel payout multiple for 1 unit on each side
  const yesMult = m.yesPool === 0n ? null : Number((total * 1000n) / m.yesPool) / 1000;
  const noMult = m.noPool === 0n ? null : Number((total * 1000n) / m.noPool) / 1000;
  return { total, yesPct, noPct: 100 - yesPct, yesMult, noMult };
}

export function outcomeLabel(o: number) {
  return ["Open", "YES won", "NO won", "Void · refunded"][o] ?? "?";
}

export function status(m: Market, now: number) {
  if (m.outcome !== Outcome.Unresolved) return outcomeLabel(m.outcome);
  return now < Number(m.closeTime) ? "Open" : "Awaiting resolution";
}

export function countdown(closeTime: bigint, now: number) {
  let s = Number(closeTime) - now;
  if (s <= 0) return "closed";
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d >= 2) return `${d}d ${h}h`; // "6d 23h", not "167h 4m"
  if (d === 1) return `${24 + h}h ${m}m`;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}
