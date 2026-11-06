"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEventLogs } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ETH_USD_FEED, FEED_DECIMALS, HUB_ADDRESS, HUB_CHAIN } from "@/lib/config";
import { hubAbi } from "@/lib/abi";
import { useEthPrice } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";

const DURATIONS = [
  { label: "1h", s: 3600 },
  { label: "3h", s: 3 * 3600 },
  { label: "12h", s: 12 * 3600 },
  { label: "24h", s: 24 * 3600 },
];

export function CreateMarket({ onCreated }: { onCreated?: () => void }) {
  const config = useConfig();
  const router = useRouter();
  const { chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const price = useEthPrice();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [strike, setStrike] = useState("");
  const [dur, setDur] = useState(DURATIONS[1].s);

  const live = price ? Number(price.price) / 10 ** FEED_DECIMALS : undefined;
  const strikeNum = Number(strike || (live ? Math.round(live / 10) * 10 : 0));

  const create = () =>
    action.run(async (step) => {
      if (!strikeNum || strikeNum <= 0) throw new Error("Enter a strike price");
      step("switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      const close = BigInt(Math.floor(Date.now() / 1000) + dur);
      const label = DURATIONS.find((d) => d.s === dur)?.label;
      const q = `Will ETH be above $${strikeNum.toLocaleString("en-US")} in ${label}?`;
      step("confirm in your wallet…");
      const h = await writeContract(config, {
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "createMarket",
        args: [ETH_USD_FEED, BigInt(Math.round(strikeNum * 100)) * 10n ** BigInt(FEED_DECIMALS - 2), close, q],
        chainId: HUB_CHAIN.id,
      });
      step("writing it in the book…");
      const r = await waitForTransactionReceipt(config, { hash: h, chainId: HUB_CHAIN.id });
      const created = parseEventLogs({ abi: hubAbi, logs: r.logs, eventName: "MarketCreated" })[0];
      setOpen(false);
      onCreated?.();
      if (created) router.push(`/market/${created.args.marketId}`);
    });

  if (!open)
    return (
      <button className="btn-ghost rotate-2 text-lg" onClick={() => setOpen(true)}>
        ✎ new market
      </button>
    );

  return (
    <div className="card tilt-r w-full p-5">
      <div className="mb-3 font-display text-3xl">Ask the crowd</div>
      <div className="mb-3 flex flex-wrap items-center gap-2 font-hand text-xl">
        Will ETH be above $
        <input
          value={strike}
          placeholder={live ? String(Math.round(live / 10) * 10) : "2500"}
          onChange={(e) => setStrike(e.target.value.replace(/[^0-9.]/g, ""))}
          className="field w-28"
        />
        in
        {DURATIONS.map((d, i) => (
          <button key={d.s} onClick={() => setDur(d.s)} className={`btn-ghost px-2.5 py-1 ${dur === d.s ? "bg-hl/60" : ""} ${i % 2 ? "rotate-2" : "-rotate-2"}`}>
            {d.label}
          </button>
        ))}
        ?
      </div>
      <div className="mb-4 font-hand text-base text-muted">
        ETH is {live ? `$${live.toFixed(2)}` : "…"} right now. Settles on the first Chainlink ETH/USD price after close. Cross-chain bets take ~25 min,
        so 1h+ works best.
      </div>
      <div className="flex gap-3">
        <button className="btn-primary" disabled={!isConnected || action.busy} onClick={create}>
          {action.step ?? (isConnected ? "Open market" : "connect to create")}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>
          never mind
        </button>
      </div>
      {action.error && <div className="mt-2 break-words font-hand text-base text-no">{action.error}</div>}
    </div>
  );
}
