"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { IconCheck, IconCopy, IconExternal } from "./Doodles";

/** "I called YES, dare you to take NO": share link preselecting the opposite side, on any chain. */
export function ShareChallenge({ marketId, question }: { marketId: bigint; question: string }) {
  const { address } = useConnection();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  // `mine` = the side the sharer took; the friend's link preselects the opposite side.
  const link = (mine: "yes" | "no") => {
    const u = new URL(`/market/${marketId}`, window.location.origin);
    u.searchParams.set("side", mine === "yes" ? "no" : "yes");
    if (address) u.searchParams.set("from", address);
    return u.toString();
  };

  async function copy(mine: "yes" | "no") {
    try {
      await navigator.clipboard.writeText(link(mine));
    } catch {}
    setCopied(mine);
    setTimeout(() => setCopied(null), 2000);
  }

  const post = (mine: "yes" | "no") => {
    const text = `I'm calling ${mine.toUpperCase()} on "${question}". Dare you to take the other side, from any chain.`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link(mine))}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <section className="@container card space-y-4 p-6">
      <div>
        <h2 className="font-display text-head">Dare a friend</h2>
        <p className="mt-1 text-sm text-muted">Send a link with the other side already picked. They can bet from any chain.</p>
      </div>
      <div className="grid gap-4 @md:grid-cols-2 @md:gap-3">
        {(["yes", "no"] as const).map((s) => {
          const word = s.toUpperCase();
          return (
            <div key={s} className="flex flex-col items-center gap-1">
              <button className="btn-ghost w-full" onClick={() => copy(s)} aria-live="polite">
                {copied === s ? (
                  <>
                    <IconCheck className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <IconCopy className="h-4 w-4" />
                    <span>
                      I picked <span className={s === "yes" ? "text-yes" : "text-no"}>{word}</span> · copy link
                    </span>
                  </>
                )}
              </button>
              <button className="btn-quiet" onClick={() => post(s)} aria-label={`Post my ${word} pick on X`}>
                Post on X
                <IconExternal className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
