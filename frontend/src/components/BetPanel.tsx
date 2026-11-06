"use client";

import { useState } from "react";
import { maxUint256, parseEventLogs, parseUnits } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, MIN_BET, NETS, ccipExplorerTx, type Market, type Net } from "@/lib/config";
import { bnmAbi, hubAbi, spokeAbi } from "@/lib/abi";
import { fmtToken, odds } from "@/lib/format";
import { usePending } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { ChainDot } from "./ChainDot";
import { Arrow, Circled } from "./Doodles";

export function BetPanel({
  marketId,
  market,
  now,
  defaultSide,
  onPlaced,
}: {
  marketId: bigint;
  market: Market;
  now: number;
  defaultSide?: boolean;
  onPlaced?: () => void;
}) {
  const config = useConfig();
  const { address, chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const pending = usePending();
  const action = useAction();

  // user's explicit pick wins; otherwise follow the wallet's chain
  const [picked, setNet] = useState<Net | null>(null);
  const net = picked ?? NETS.find((x) => x.chain.id === chainId) ?? NETS[0];
  const [yes, setYes] = useState<boolean>(defaultSide ?? true);
  const [amountStr, setAmountStr] = useState("0.1");
  const [lastTx, setLastTx] = useState<{ hash: string; net: Net } | null>(null);

  const balance = useReadContract({
    address: net.bnm,
    abi: bnmAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: net.chain.id,
    query: { enabled: !!address },
  });

  let amount = 0n;
  try {
    amount = parseUnits(amountStr || "0", 18);
  } catch {}
  if (amount < 0n) amount = 0n;

  const secondsLeft = Number(market.closeTime) - now;
  const open = market.outcome === 0 && secondsLeft > 0;
  const lateRisk = !net.isHub && secondsLeft < 35 * 60;

  // parimutuel payout preview after adding this stake
  const yesPool = market.yesPool + (yes ? amount : 0n);
  const noPool = market.noPool + (yes ? 0n : amount);
  const side = yes ? yesPool : noPool;
  const estPayout = amount === 0n || side === 0n ? 0n : (amount * odds({ yesPool, noPool }).total) / side;

  async function ensureChain(target: Net) {
    if (chainId !== target.chain.id) await switchChainAsync({ chainId: target.chain.id });
  }

  const drip = () =>
    action.run(async (step) => {
      if (!address) throw new Error("Connect a wallet first");
      step(`switching to ${net.short}…`);
      await ensureChain(net);
      step("minting 1 CCIP-BnM…");
      const h = await writeContract(config, { address: net.bnm, abi: bnmAbi, functionName: "drip", args: [address], chainId: net.chain.id });
      await waitForTransactionReceipt(config, { hash: h, chainId: net.chain.id });
    });

  const placeBet = () =>
    action.run(async (step) => {
      if (!address) throw new Error("Connect a wallet first");
      if (amount < MIN_BET) throw new Error("Minimum bet is 0.001");
      const cid = net.chain.id;
      step(`switching to ${net.short}…`);
      await ensureChain(net);

      const allowance = await readContract(config, { address: net.bnm, abi: bnmAbi, functionName: "allowance", args: [address, net.entry], chainId: cid });
      if (allowance < amount) {
        step("approve CCIP-BnM in your wallet…");
        const h = await writeContract(config, { address: net.bnm, abi: bnmAbi, functionName: "approve", args: [net.entry, maxUint256], chainId: cid });
        step("waiting for approval…");
        await waitForTransactionReceipt(config, { hash: h, chainId: cid });
      }

      if (net.isHub) {
        step("confirm your bet…");
        const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "bet", args: [marketId, yes, amount], chainId: cid });
        step("writing it down…");
        await waitForTransactionReceipt(config, { hash: h, chainId: cid });
        setLastTx({ hash: h, net });
      } else {
        step("quoting the CCIP fee…");
        const fee = await readContract(config, {
          address: net.entry,
          abi: spokeAbi,
          functionName: "quoteBet",
          args: [marketId, yes, amount],
          chainId: cid,
          account: address,
        });
        step("confirm your cross-chain bet…");
        const h = await writeContract(config, {
          address: net.entry,
          abi: spokeAbi,
          functionName: "placeBet",
          args: [marketId, yes, amount],
          value: (fee * 12n) / 10n, // 20% buffer; the spoke refunds the excess
          chainId: cid,
        });
        step("sending it across…");
        const r = await waitForTransactionReceipt(config, { hash: h, chainId: cid });
        if (r.status !== "success") throw new Error("Transaction reverted");
        const sent = parseEventLogs({ abi: spokeAbi, logs: r.logs, eventName: "BetSent" })[0];
        pending.add({
          kind: "bet",
          srcTx: h,
          msgId: sent?.args.messageId,
          chainId: cid,
          marketId: marketId.toString(),
          user: address,
          yes,
          amount: amount.toString(),
          at: Math.floor(Date.now() / 1000),
        });
        setLastTx({ hash: h, net });
      }
      onPlaced?.();
    });

  if (!open) return null;

  return (
    <div className="card tilt-l relative p-5">
      <div className="mb-4 font-display text-3xl">Make your call</div>

      <div className="mb-4">
        <div className="mb-2 font-hand text-lg text-muted">bet from…</div>
        <div className="grid grid-cols-3 gap-2.5">
          {NETS.map((n, i) => {
            const on = net.chain.id === n.chain.id;
            return (
              <button
                key={n.chain.id}
                onClick={() => setNet(n)}
                className={`btn-ghost flex-col gap-0.5 px-1 py-2 ${on ? "bg-hl/50" : ""} ${i === 1 ? "rotate-1" : i === 2 ? "-rotate-1" : ""}`}
              >
                <ChainDot net={n} />
                <span className="text-sm text-muted">{n.isHub ? "instant" : `CCIP ${n.eta}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {[true, false].map((v) => {
          const on = yes === v;
          return (
            <button
              key={String(v)}
              onClick={() => setYes(v)}
              className={`btn relative py-3 font-display text-3xl ${
                on ? (v ? "bg-yes text-on-color" : "bg-no text-on-color") : v ? "bg-card text-yes" : "bg-card text-no"
              } ${v ? "-rotate-2" : "rotate-2"}`}
            >
              {v ? "YES" : "NO"}
              {on && <Circled className="pointer-events-none absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] text-ink" />}
            </button>
          );
        })}
      </div>

      <div className="mb-1.5 flex items-center justify-between font-hand text-base text-muted">
        <span>how much? (CCIP-BnM)</span>
        <span>
          you have {balance.data !== undefined ? fmtToken(balance.data) : "–"} ·{" "}
          <button className="text-accent underline decoration-wavy underline-offset-4" onClick={drip} disabled={action.busy}>
            grab test tokens
          </button>
        </span>
      </div>
      <div className="mb-4 flex gap-2">
        <input
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          className="field w-full"
        />
        {["0.1", "0.5", "1"].map((v, i) => (
          <button key={v} className={`btn-ghost px-2.5 ${i % 2 ? "rotate-2" : "-rotate-1"}`} onClick={() => setAmountStr(v)}>
            {v}
          </button>
        ))}
      </div>

      <div className="mb-4 font-hand text-lg leading-snug">
        if <span className={yes ? "text-yes" : "text-no"}>{yes ? "YES" : "NO"}</span> wins you get ≈{" "}
        <span className="highlight font-display text-2xl">{fmtToken(estPayout)}</span> on {net.short}
        {!net.isHub && <span className="text-muted"> (flown back over CCIP)</span>}
        <span className="text-muted">. odds move as people bet.</span>
      </div>

      {lateRisk && (
        <div className="sketch-alt mb-4 border-no p-2.5 font-hand text-base text-no">
          heads up: CCIP from {net.short} takes {net.eta}. If your bet lands after close it gets refunded automatically.
        </div>
      )}

      {!isConnected ? (
        <div className="text-center font-hand text-lg text-muted">connect a wallet to bet ↗</div>
      ) : (
        <div className="relative">
          <Arrow className="pointer-events-none absolute -top-12 -left-3 hidden h-12 w-16 -scale-x-100 rotate-[200deg] text-muted sm:block" />
          <button
            className={`btn w-full py-3 font-display text-2xl ${yes ? "bg-yes" : "bg-no"} text-on-color`}
            disabled={action.busy || amount < MIN_BET}
            onClick={placeBet}
          >
            {action.step ?? `${yes ? "YES" : "NO"} · ${amountStr || 0} from ${net.short}`}
          </button>
        </div>
      )}

      {action.error && <div className="mt-2 break-words font-hand text-base text-no">{action.error}</div>}
      {lastTx && !action.busy && (
        <div className="mt-3 font-hand text-lg text-muted">
          {lastTx.net.isHub ? (
            "✔ written down on the hub"
          ) : (
            <>
              ✈ sent! follow it on the{" "}
              <a className="text-accent underline" href={ccipExplorerTx(lastTx.hash)} target="_blank" rel="noreferrer">
                CCIP Explorer
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
