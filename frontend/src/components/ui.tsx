import type { ReactNode } from "react";
import { Outcome, type Market } from "@/lib/config";
import { status } from "@/lib/format";
import { IconExternal } from "./Doodles";

/** Small shared pieces so every card renders status, links and errors the same way. */

/** "● Open" / "● YES won": ink dot + text. Muted once the market is no longer open. */
export function StatusLabel({ market, now }: { market: Market; now: number }) {
  const open = market.outcome === Outcome.Unresolved && now < Number(market.closeTime);
  const label =
    market.outcome === Outcome.Yes ? (
      <>
        <span className="text-yes">YES</span> won
      </>
    ) : market.outcome === Outcome.No ? (
      <>
        <span className="text-no">NO</span> won
      </>
    ) : (
      status(market, now)
    );
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${open ? "text-ink" : "text-muted"}`}>
      <span className={`status-dot shrink-0 ${open ? "" : "opacity-50"}`} />
      <span>{label}</span>
    </span>
  );
}

/** Text link that opens elsewhere (explorer, CCIP Explorer). */
export function ExternalLink({ href, title, className, children }: { href: string; title?: string; className?: string; children: ReactNode }) {
  return (
    <a className={`link inline-flex shrink-0 items-center gap-1 ${className ?? ""}`} href={href} title={title} target="_blank" rel="noreferrer">
      {children}
      <IconExternal className="h-3.5 w-3.5" />
    </a>
  );
}

/** Error line under a transaction button. A wallet rejection reads as a calm, muted note. */
export function ActionError({ action, className }: { action: { error: string | null; cancelled: boolean }; className?: string }) {
  if (!action.error) return null;
  return (
    <p role="alert" className={`break-words text-sm ${action.cancelled ? "text-muted" : "text-no"} ${className ?? ""}`}>
      {action.cancelled ? "Cancelled in wallet." : action.error}
    </p>
  );
}
