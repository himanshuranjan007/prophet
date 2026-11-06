"use client";

import { useId, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { formatEther, maxUint256, parseEventLogs, parseUnits } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, MIN_BET, NETS, ccipExplorerTx, type Market, type Net } from "@/lib/config";
import { bnmAbi, hubAbi, spokeAbi } from "@/lib/abi";
import { fmtToken, odds } from "@/lib/format";
import { usePending } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { walletModal } from "@/lib/walletModal";
import { ChainDot } from "./ChainDot";
import { IconAlert, IconCheck, IconCoins, IconPlane } from "./Doodles";
import { ActionError, ExternalLink } from "./ui";

const PRESETS = ["0.1", "0.5", "1"];

/** Native-token fee, at most 6 decimals. */
function fmtFee(wei: bigint) {
  const n = Number(formatEther(wei));
  if (n > 0 && n < 0.000001) return "< 0.000001";
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

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
  const amountId = useId();

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

  // live CCIP fee preview for spoke bets (display only; placeBet re-quotes)
  const quote = useReadContract({
    address: net.entry,
    abi: spokeAbi,
    functionName: "quoteBet",
    args: [marketId, yes, amount],
    chainId: net.chain.id,
    account: address,
    query: { enabled: open && !net.isHub && amount >= MIN_BET, placeholderData: keepPreviousData },
  });

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
      step(`Switching to ${net.short}…`);
      await ensureChain(net);
      step("Minting 1 CCIP-BnM…");
      const h = await writeContract(config, { address: net.bnm, abi: bnmAbi, functionName: "drip", args: [address], chainId: net.chain.id });
      await waitForTransactionReceipt(config, { hash: h, chainId: net.chain.id });
    });

  const placeBet = () =>
    action.run(async (step) => {
      if (!address) throw new Error("Connect a wallet first");
      if (amount < MIN_BET) throw new Error("Minimum bet is 0.001");
      const cid = net.chain.id;
      step(`Switching to ${net.short}…`);
      await ensureChain(net);

      const allowance = await readContract(config, { address: net.bnm, abi: bnmAbi, functionName: "allowance", args: [address, net.entry], chainId: cid });
      if (allowance < amount) {
        step("Approve CCIP-BnM in your wallet…");
        const h = await writeContract(config, { address: net.bnm, abi: bnmAbi, functionName: "approve", args: [net.entry, maxUint256], chainId: cid });
        step("Waiting for approval…");
        await waitForTransactionReceipt(config, { hash: h, chainId: cid });
      }

      if (net.isHub) {
        step("Confirm your bet…");
        const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "bet", args: [marketId, yes, amount], chainId: cid });
        step("Recording your bet…");
        await waitForTransactionReceipt(config, { hash: h, chainId: cid });
        setLastTx({ hash: h, net });
      } else {
        step("Quoting the CCIP fee…");
        const fee = await readContract(config, {
          address: net.entry,
          abi: spokeAbi,
          functionName: "quoteBet",
          args: [marketId, yes, amount],
          chainId: cid,
          account: address,
        });
        step("Confirm your cross-chain bet…");
        const h = await writeContract(config, {
          address: net.entry,
          abi: spokeAbi,
          functionName: "placeBet",
          args: [marketId, yes, amount],
          value: (fee * 12n) / 10n, // 20% buffer; the spoke refunds the excess
          chainId: cid,
        });
        step("Sending over CCIP…");
        // wagmi's waitForTransactionReceipt throws on a reverted receipt
        const r = await waitForTransactionReceipt(config, { hash: h, chainId: cid });
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

  const sideWord = yes ? "YES" : "NO";
  const sideText = yes ? "text-yes" : "text-no";
  const nativeSym = net.chain.nativeCurrency.symbol;

  let ctaLabel = `Bet ${amountStr || 0} on ${sideWord} from ${net.short}`;
  if (!isConnected) ctaLabel = "Connect a wallet to bet";
  else if (amount === 0n) ctaLabel = "Enter an amount";
  else if (amount < MIN_BET) ctaLabel = "Minimum bet is 0.001";

  return (
    <section className="card-primary space-y-4 p-6" aria-labelledby={`${amountId}-title`}>
      <h2 id={`${amountId}-title`} className="font-display text-head">
        Place a bet
      </h2>

      {/* chain: one segmented control */}
      <div>
        <div className="eyebrow mb-2">Bet from</div>
        <div className="sketch-thin grid grid-cols-3 divide-x divide-line overflow-hidden" role="group" aria-label="Chain to bet from">
          {NETS.map((n) => {
            const on = net.chain.id === n.chain.id;
            return (
              <button
                key={n.chain.id}
                type="button"
                aria-pressed={on}
                onClick={() => setNet(n)}
                // keep the focus ring inside the clipped segment (global :focus-visible is unlayered)
                style={{ outlineOffset: "-4px" }}
                className={`flex min-w-0 flex-col items-center gap-1.5 px-1 py-2.5 text-center transition-colors duration-(--dur-quick) ${
                  on ? "bg-hl/50" : "hover:bg-ink/5"
                }`}
              >
                <ChainDot net={n} />
                <span className="num text-xs text-muted">{n.isHub ? "instant" : `CCIP ${n.eta}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* side */}
      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Outcome">
        {[true, false].map((v) => {
          const on = yes === v;
          const look = on ? (v ? "btn-yes" : "btn-no") : `btn-ghost ${v ? "text-yes" : "text-no"}`;
          return (
            <button key={String(v)} type="button" aria-pressed={on} onClick={() => setYes(v)} className={`${look} py-2.5 text-lg font-bold tracking-wide`}>
              {v ? "YES" : "NO"}
            </button>
          );
        })}
      </div>

      {/* amount */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <label htmlFor={amountId} className="eyebrow">
            Amount
          </label>
          {isConnected && (
            <div className="flex items-center gap-1 text-sm text-muted">
              <span className="num">Balance {balance.data !== undefined ? fmtToken(balance.data) : "–"}</span>
              <span aria-hidden>·</span>
              <button type="button" className="btn-quiet -mr-2" onClick={drip} disabled={action.busy}>
                <IconCoins className="h-4 w-4" />
                Get test tokens
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <input
            id={amountId}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            autoComplete="off"
            className="field num w-full pr-14 text-lg font-semibold"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-muted">BnM</span>
        </div>
        <div className="mt-2 flex gap-2">
          {PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={amountStr === v}
              className={`chip num transition-colors duration-(--dur-quick) ${amountStr === v ? "bg-hl/50" : "hover:bg-ink/5"}`}
              onClick={() => setAmountStr(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <hr className="rule" />

      {/* what you get */}
      <div className="space-y-1.5">
        <p className="leading-snug">
          If <span className={`font-bold ${sideText}`}>{sideWord}</span> wins you receive ≈{" "}
          <span className="num text-lg font-bold">{fmtToken(estPayout)} BnM</span> on {net.short}
          {!net.isHub && <span className="text-muted"> (paid back over CCIP)</span>}
        </p>
        <p className="text-xs text-muted">Odds move as others bet.</p>
        <p className="num text-xs text-muted">
          {net.isHub ? (
            "No bridge fee · instant"
          ) : quote.data !== undefined ? (
            <>
              CCIP fee ≈{" "}
              <span className={`transition-opacity duration-(--dur-quick) ${quote.isPlaceholderData ? "opacity-50" : ""}`}>
                {fmtFee(quote.data)} {nativeSym}
              </span>{" "}
              · excess refunded
            </>
          ) : quote.isFetching ? (
            "Quoting CCIP fee…"
          ) : (
            `CCIP fee paid in ${nativeSym} · excess refunded`
          )}
        </p>
      </div>

      {lateRisk && (
        <p className="flex items-start gap-2 text-sm text-no">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            CCIP from {net.short} takes <span className="num">{net.eta}</span>. If your bet lands after close, it is refunded automatically.
          </span>
        </p>
      )}

      {/* action + feedback */}
      <div className="space-y-3">
        <button
          type="button"
          className={`${!isConnected ? "btn-primary" : yes ? "btn-yes" : "btn-no"} num w-full py-3 text-base whitespace-normal`}
          disabled={isConnected && (action.busy || amount < MIN_BET)}
          aria-busy={action.busy}
          onClick={isConnected ? placeBet : () => walletModal.open()}
        >
          {action.step ?? ctaLabel}
        </button>

        <ActionError action={action} />

        {lastTx && !action.busy && (
          <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {lastTx.net.isHub ? (
              <>
                <IconCheck className="h-4 w-4 shrink-0" />
                Bet recorded on {lastTx.net.short}
              </>
            ) : (
              <>
                <IconPlane className="h-4 w-4 shrink-0" />
                <span>Sent over CCIP</span>
                <span className="text-muted" aria-hidden>
                  ·
                </span>
                <ExternalLink href={ccipExplorerTx(lastTx.hash)}>Track on CCIP Explorer</ExternalLink>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
