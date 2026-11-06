"use client";

import { useState } from "react";
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
      step("Switching to Base…");
      if (chainId !== HUB_CHAIN.id) await switchChainAsync({ chainId: HUB_CHAIN.id });
      const close = BigInt(Math.floor(Date.now() / 1000) + dur);
      const label = DURATIONS.find((d) => d.s === dur)?.label;
      const q = `Will ETH be above $${strikeNum.toLocaleString("en-US")} in ${label}?`;
      step("Confirm in your wallet…");
      const h = await writeContract(config, {
        address: HUB_ADDRESS,
        abi: hubAbi,
        functionName: "createMarket",
        args: [ETH_USD_FEED, BigInt(Math.round(strikeNum * 100)) * 10n ** BigInt(FEED_DECIMALS - 2), close, q],
        chainId: HUB_CHAIN.id,
      });
      step("Creating…");
      await waitForTransactionReceipt(config, { hash: h, chainId: HUB_CHAIN.id });
      setOpen(false);
      onCreated?.();
    });

  if (!open)
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        + New market
      </button>
    );

  return (
    <div className="card w-full p-4">
      <div className="mb-3 text-sm font-medium">New ETH/USD market</div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        Will ETH be above $
        <input
          value={strike}
          placeholder={live ? String(Math.round(live / 10) * 10) : "2500"}
          onChange={(e) => setStrike(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-28 rounded-lg border border-line bg-background px-2 py-1.5 font-mono outline-none focus:border-accent"
        />
        in
        {DURATIONS.map((d) => (
          <button key={d.s} onClick={() => setDur(d.s)} className={`btn-ghost px-2.5 py-1 ${dur === d.s ? "border-accent text-accent" : ""}`}>
            {d.label}
          </button>
        ))}
        ?
      </div>
      <div className="mb-3 text-xs text-muted">
        Live price {live ? `$${live.toFixed(2)}` : "…"}. Settles on the first Chainlink ETH/USD update after close. Cross-chain bets take about 25 min,
        so 1h+ markets work best.
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={!isConnected || action.busy} onClick={create}>
          {action.step ?? (isConnected ? "Create market" : "Connect to create")}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {action.error && <div className="mt-2 break-words text-xs text-no">{action.error}</div>}
    </div>
  );
}
