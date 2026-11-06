import Link from "next/link";
import { fmtToken } from "@/lib/format";

/**
 * Small pieces every portfolio section shares, so a stake, an amount and a market question read the
 * same everywhere on the page:
 * - a stake on a side is "0.2 YES" in that side's colour (as on the market page),
 * - any other amount is "1.25 BnM" in ink,
 * - a market's own row leads with its question in the serif; a row about something else names the
 *   market on a muted, truncated line.
 */

/** "0.2 YES" / "0.15 NO": a stake, coloured by its side. */
export function Stake({ amount, yes }: { amount: bigint; yes: boolean }) {
  return (
    <span className={`num font-semibold ${yes ? "text-yes" : "text-no"}`}>
      {fmtToken(amount)} {yes ? "YES" : "NO"}
    </span>
  );
}

/** "1.25 BnM": a payout, refund or total. */
export function Tokens({ amount, className }: { amount: bigint; className?: string }) {
  return <span className={`num font-semibold ${className ?? ""}`}>{fmtToken(amount)} BnM</span>;
}

/** The question as a row title (serif h3), linking to the market. */
export function QuestionTitle({ id, question, titleId }: { id: number; question: string; titleId?: string }) {
  return (
    <h3 id={titleId} className="min-w-0 break-words font-display text-[1.35rem] leading-tight">
      <Link href={`/market/${id}`} className="decoration-1 underline-offset-4 hover:underline">
        {question}
      </Link>
    </h3>
  );
}

/** The market a row is about, as a muted one-line link under it. */
export function QuestionLine({ id, question }: { id: number; question?: string }) {
  return (
    <Link
      href={`/market/${id}`}
      className="block min-w-0 truncate text-sm text-muted decoration-1 underline-offset-4 hover:text-ink hover:underline"
    >
      {question ?? `Market #${id}`}
    </Link>
  );
}
