"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { Sparkle } from "./Doodles";

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
    const text = `I'm calling ${mine.toUpperCase()} on "${question}". Dare you to take the other side, from any chain 🔮`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link(mine))}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="card tilt-r relative p-5">
      <Sparkle className="wiggle absolute -top-3 right-6 h-7 w-7 text-pink" />
      <div className="mb-1 font-display text-3xl">Dare a friend</div>
      <div className="mb-4 font-hand text-lg text-muted">
        send a link with the other side already picked. They can bet from whatever chain they&apos;re on.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(["yes", "no"] as const).map((s) => (
          <div key={s} className="flex flex-col gap-2">
            <button className={`btn-ghost ${s === "yes" ? "-rotate-1 text-yes" : "rotate-1 text-no"}`} onClick={() => copy(s)}>
              {copied === s ? "copied ✔" : `I'm ${s.toUpperCase()} · copy link`}
            </button>
            <button className="font-hand text-base text-muted underline decoration-wavy underline-offset-4 hover:text-ink" onClick={() => post(s)}>
              post my {s.toUpperCase()} on X
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
