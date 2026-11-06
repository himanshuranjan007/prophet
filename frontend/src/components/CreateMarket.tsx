"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEventLogs } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ETH_USD_FEED, FEED_DECIMALS, HUB_ADDRESS, HUB_CHAIN } from "@/lib/config";
import { hubAbi } from "@/lib/abi";
import { fmtUsd } from "@/lib/format";
import { useEthPrice, useNow } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { IconPencil } from "./Doodles";
import { ActionError } from "./ui";

const DURATIONS = [
  { label: "1h", s: 3600 },
  { label: "3h", s: 3 * 3600 },
  { label: "12h", s: 12 * 3600 },
  { label: "24h", s: 24 * 3600 },
];

/** "HH:MM" in UTC, zero-padded, from unix seconds. */
const utcTime = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function CreateMarket({ onCreated }: { onCreated?: () => void }) {
  const config = useConfig();
  const router = useRouter();
  const { chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const price = useEthPrice();
  const now = useNow();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [strike, setStrike] = useState("");
  const [dur, setDur] = useState(DURATIONS[1].s);

  const live = price ? Number(price.price) / 10 ** FEED_DECIMALS : undefined;
  const strikeNum = Number(strike || (live ? Math.round(live / 10) * 10 : 0));

  const create = () =>
    action.run(async (step) => {
      if (!strikeNum || strikeNum <= 0) throw new Error("Enter a strike price");
      step("Switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      const closeSec = Math.floor(Date.now() / 1000) + dur;
      const close = BigInt(closeSec);
      const q = `Will ETH be above $${strikeNum.toLocaleString("en-US")} at ${utcTime(closeSec)} UTC?`;
      step("Confirm in your wallet…");
      const h = await writeContract(config, {
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "createMarket",
        args: [ETH_USD_FEED, BigInt(Math.round(strikeNum * 100)) * 10n ** BigInt(FEED_DECIMALS - 2), close, q],
        chainId: HUB_CHAIN.id,
      });
      step("Creating the market…");
      const r = await waitForTransactionReceipt(config, { hash: h, chainId: HUB_CHAIN.id });
      const created = parseEventLogs({ abi: hubAbi, logs: r.logs, eventName: "MarketCreated" })[0];
      setOpen(false);
      onCreated?.();
      if (created) router.push(`/market/${created.args.marketId}`);
    });

  if (!open)
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        <IconPencil className="h-4 w-4" />
        New market
      </button>
    );

  return (
    <div className="card w-full p-6">
      <h3 className="font-display text-head">New market</h3>

      <div className="mt-4 space-y-4">
        {/* the question, as a sentence */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 font-display text-[1.6rem] leading-tight">
          <span>Will ETH be above</span>
          <span className="relative inline-flex">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-sans text-base font-semibold text-muted">
              $
            </span>
            <input
              value={strike}
              inputMode="decimal"
              aria-label="Strike price in USD"
              placeholder={live ? String(Math.round(live / 10) * 10) : "2500"}
              onChange={(e) => setStrike(e.target.value.replace(/[^0-9.]/g, ""))}
              className="field num w-32 pl-7 font-sans font-semibold"
            />
          </span>
          <span className="whitespace-nowrap">
            at <span className="num font-sans text-xl font-bold">{utcTime(now + dur)} UTC?</span>
          </span>
        </div>

        <div>
          <div className="eyebrow mb-2">Closes in</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Closes in">
            {DURATIONS.map((d) => (
              <button
                key={d.s}
                type="button"
                aria-pressed={dur === d.s}
                onClick={() => setDur(d.s)}
                className={`chip num transition-colors duration-(--dur-quick) ${dur === d.s ? "bg-hl/50" : "hover:bg-ink/5"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          ETH is <span className="num text-ink">{price ? fmtUsd(price.price) : "…"}</span> right now. Settles on the first
          Chainlink ETH/USD price after close. Bets from other chains take <span className="num">~25 min</span> over CCIP, so{" "}
          <span className="num">1h</span> or more works best.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={!isConnected || action.busy} onClick={create}>
            {action.step ?? (isConnected ? "Create market" : "Connect a wallet to create")}
          </button>
          <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>

        <ActionError action={action} />
      </div>
    </div>
  );
}
