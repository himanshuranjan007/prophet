"use client";

import { useState } from "react";
import { useConnection } from "wagmi";

/** "I bet YES, take the other side": share link that preselects the opposite side for a friend. */
export function ShareChallenge({ marketId, question }: { marketId: bigint; question: string }) {
  const { address } = useConnection();
  const [copied, setCopied] = useState<string | null>(null);

  const link = (side: "yes" | "no") => {
    const u = new URL(`/market/${marketId}`, window.location.origin);
    u.searchParams.set("side", side === "yes" ? "no" : "yes"); // friend gets the opposite side
    if (address) u.searchParams.set("from", address);
    return u.toString();
  };

  async function copy(side: "yes" | "no") {
    const url = link(side);
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    setCopied(side);
    setTimeout(() => setCopied(null), 2000);
  }

  const tweet = (side: "yes" | "no") =>
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `I'm betting ${side.toUpperCase()} on "${question}". Take the other side from any chain 👇`,
    )}&url=${encodeURIComponent(typeof window !== "undefined" ? link(side) : "")}`;

  return (
    <div className="card p-4">
      <div className="mb-1 text-sm font-medium">Challenge a friend</div>
      <div className="mb-3 text-xs text-muted">Share a link that opens this market with the opposite side picked, on whatever chain they use.</div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost text-yes" onClick={() => copy("yes")}>
          {copied === "yes" ? "Copied ✓" : "I'm YES · copy link"}
        </button>
        <button className="btn-ghost text-no" onClick={() => copy("no")}>
          {copied === "no" ? "Copied ✓" : "I'm NO · copy link"}
        </button>
        <a className="btn-ghost col-span-2 text-xs" href={tweet("yes")} target="_blank" rel="noreferrer">
          Post on X
        </a>
      </div>
    </div>
  );
}
