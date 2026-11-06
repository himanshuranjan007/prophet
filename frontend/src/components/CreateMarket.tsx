"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEventLogs } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ASSETS, FEED_DECIMALS, HUB_ADDRESS, HUB_CHAIN, type AssetSymbol } from "@/lib/config";
import { hubAbi } from "@/lib/abi";
import { fmtUsd } from "@/lib/format";
import { useAssetPrice, useNow } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { walletModal } from "@/lib/walletModal";
import { IconPencil } from "./Doodles";
import { ActionError } from "./ui";

const DURATIONS = [
  { label: "1h", s: 3600 },
  { label: "3h", s: 3 * 3600 },
  { label: "12h", s: 12 * 3600 },
  { label: "24h", s: 24 * 3600 },
];

/** "2,240" / "90.50": thousands separators, 2 decimals only when there's a fraction. */
const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
/** Same, without separators (for the input placeholder). */
const usdPlain = (v: number) => (v % 1 ? v.toFixed(2) : String(v));

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
  const [symbol, setSymbol] = useState<AssetSymbol>("ETH");
  const asset = ASSETS.find((a) => a.symbol === symbol)!;
  const price = useAssetPrice(asset);
  const now = useNow();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [strike, setStrike] = useState("");
  const [dur, setDur] = useState(DURATIONS[1].s);

  const live = price ? Number(price.price) / 10 ** FEED_DECIMALS : undefined;
  const suggested = live !== undefined ? Math.round(live / asset.strikeStep) * asset.strikeStep : undefined;
  const strikeNum = Number(strike || suggested || 0);

  const create = () =>
    action.run(async (step) => {
      if (!strikeNum || strikeNum <= 0) throw new Error("Enter a strike price");
      step("Switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      const closeSec = Math.floor(Date.now() / 1000) + dur;
      const close = BigInt(closeSec);
      const q = `Will ${asset.symbol} be above $${usd(strikeNum)} at ${utcTime(closeSec)} UTC?`;
      step("Confirm in your wallet…");
      const h = await writeContract(config, {
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "createMarket",
        args: [asset.feed, BigInt(Math.round(strikeNum * 100)) * 10n ** BigInt(FEED_DECIMALS - 2), close, q],
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
        <div>
          <div className="eyebrow mb-2">Asset</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Asset">
            {ASSETS.map((a) => (
              <button
                key={a.symbol}
                type="button"
                aria-pressed={symbol === a.symbol}
                onClick={() => {
                  setSymbol(a.symbol);
                  setStrike("");
                }}
                className={`chip transition-colors duration-(--dur-quick) ${symbol === a.symbol ? "bg-hl/50" : "hover:bg-ink/5"}`}
              >
                {a.symbol}
                <span className="font-normal text-muted">{a.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* the question, as a sentence */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 font-display text-[1.6rem] leading-tight">
          <span>Will {asset.symbol} be above</span>
          <span className="relative inline-flex">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-sans text-base font-semibold text-muted">
              $
            </span>
            <input
              value={strike}
              inputMode="decimal"
              aria-label="Strike price in USD"
              placeholder={suggested !== undefined ? usdPlain(suggested) : ""}
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
          {asset.symbol} is <span className="num text-ink">{price ? fmtUsd(price.price) : "…"}</span> right now. Settles on the first
          Chainlink {asset.symbol}/USD price after close
          {asset.relay ? (
            <>
              , relayed to Base over CCIP from Arbitrum (<span className="num">{asset.relay.lag}</span>; this feed only updates on 0.5%
              moves)
            </>
          ) : null}
          . Bets from other chains take <span className="num">~25 min</span> over CCIP, so{" "}
          <span className="num">{asset.relay ? "3h" : "1h"}</span> or more works best.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={isConnected && action.busy} onClick={isConnected ? create : () => walletModal.open()}>
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
