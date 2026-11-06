"use client";

import { useState } from "react";
import { maxUint256, parseUnits } from "viem";
import { useConfig, useConnection, useReadContract, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { HUB_ADDRESS, HUB_CHAIN, MIN_BET, NETS, ccipExplorerTx, type Market, type Net } from "@/lib/config";
import { bnmAbi, hubAbi, spokeAbi } from "@/lib/abi";
import { fmtToken, odds } from "@/lib/format";
import { usePending } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { ChainDot } from "./ChainDot";

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

  const secondsLeft = Number(market.closeTime) - now;
  const open = market.outcome === 0 && secondsLeft > 0;
  const lateRisk = !net.isHub && secondsLeft < 35 * 60;

  // payout preview: parimutuel after adding this stake
  const yesPool = market.yesPool + (yes ? amount : 0n);
  const noPool = market.noPool + (yes ? 0n : amount);
  const o = odds({ yesPool, noPool });
  const estPayout = amount === 0n ? 0n : (amount * o.total) / (yes ? yesPool : noPool);

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
      await balance.refetch();
    });

  const placeBet = () =>
    action.run(async (step) => {
      if (!address) throw new Error("Connect a wallet first");
      if (amount < MIN_BET) throw new Error("Minimum bet is 0.001");
      const cid = net.chain.id;
      step(`Switching to ${net.short}…`);
      await ensureChain(net);

      const allowance = await readContract(config, {
        address: net.bnm,
        abi: bnmAbi,
        functionName: "allowance",
        args: [address, net.entry],
        chainId: cid,
      });
      if (allowance < amount) {
        step("Approve CCIP-BnM in your wallet…");
        const h = await writeContract(config, { address: net.bnm, abi: bnmAbi, functionName: "approve", args: [net.entry, maxUint256], chainId: cid });
        step("Waiting for approval…");
        await waitForTransactionReceipt(config, { hash: h, chainId: cid });
      }

      if (net.isHub) {
        step("Confirm bet in your wallet…");
        const h = await writeContract(config, { address: HUB_ADDRESS, abi: hubAbi, functionName: "bet", args: [marketId, yes, amount], chainId: cid });
        step("Waiting for confirmation…");
        await waitForTransactionReceipt(config, { hash: h, chainId: cid });
        setLastTx({ hash: h, net });
      } else {
        step("Quoting CCIP fee…");
        const fee = await readContract(config, {
          address: net.entry,
          abi: spokeAbi,
          functionName: "quoteBet",
          args: [marketId, yes, amount],
          chainId: cid,
          account: address,
        });
        const pos = await readContract(config, {
          address: HUB_ADDRESS,
          abi: hubAbi,
          functionName: "getPosition",
          args: [marketId, address, net.positionSelector],
          chainId: HUB_CHAIN.id,
        });
        step("Confirm cross-chain bet in your wallet…");
        const h = await writeContract(config, {
          address: net.entry,
          abi: spokeAbi,
          functionName: "placeBet",
          args: [marketId, yes, amount],
          value: (fee * 12n) / 10n, // 20% buffer; spoke refunds the excess
          chainId: cid,
        });
        step("Waiting for source-chain confirmation…");
        const r = await waitForTransactionReceipt(config, { hash: h, chainId: cid });
        if (r.status !== "success") throw new Error("Transaction reverted");
        pending.add({
          srcTx: h,
          chainId: cid,
          marketId: marketId.toString(),
          user: address,
          yes,
          amount: amount.toString(),
          baseline: (pos.yes + pos.no).toString(),
          at: Math.floor(Date.now() / 1000),
        });
        setLastTx({ hash: h, net });
      }
      await balance.refetch();
      onPlaced?.();
    });

  if (!open) return null;

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-medium">Place a bet</div>

      <div className="mb-3">
        <div className="mb-1.5 text-xs text-muted">Bet from</div>
        <div className="grid grid-cols-3 gap-2">
          {NETS.map((n) => (
            <button
              key={n.chain.id}
              onClick={() => setNet(n)}
              className={`btn-ghost flex-col gap-0.5 py-2 ${net.chain.id === n.chain.id ? "border-accent ring-1 ring-accent" : ""}`}
            >
              <ChainDot net={n} />
              <span className="text-[10px] text-muted">{n.isHub ? "hub · instant" : `CCIP · ${n.eta}`}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setYes(true)}
          className={`btn py-3 text-base ${yes ? "bg-yes text-white" : "border border-line text-yes"}`}
        >
          YES
        </button>
        <button
          onClick={() => setYes(false)}
          className={`btn py-3 text-base ${!yes ? "bg-no text-white" : "border border-line text-no"}`}
        >
          NO
        </button>
      </div>

      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>Amount (CCIP-BnM)</span>
        <span>
          Balance {balance.data !== undefined ? fmtToken(balance.data) : "–"} ·{" "}
          <button className="text-accent underline-offset-2 hover:underline" onClick={drip} disabled={action.busy}>
            get test tokens
          </button>
        </span>
      </div>
      <div className="mb-3 flex gap-2">
        <input
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          inputMode="decimal"
          className="w-full rounded-lg border border-line bg-background px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
        {["0.1", "0.5", "1"].map((v) => (
          <button key={v} className="btn-ghost px-2 font-mono text-xs" onClick={() => setAmountStr(v)}>
            {v}
          </button>
        ))}
      </div>

      <div className="mb-3 rounded-lg bg-background p-2.5 text-xs text-muted">
        If {yes ? "YES" : "NO"} wins you receive ≈{" "}
        <span className="font-mono text-foreground">{fmtToken(estPayout)}</span> on{" "}
        <span className="text-foreground">{net.short}</span>
        {!net.isHub && " (paid back over CCIP)"}. Odds shift as others bet.
      </div>

      {lateRisk && (
        <div className="mb-3 rounded-lg border border-no/40 p-2.5 text-xs text-no">
          CCIP from {net.short} takes {net.eta}. A bet that lands after close is automatically refunded.
        </div>
      )}

      {!isConnected ? (
        <div className="text-center text-sm text-muted">Connect a wallet to bet</div>
      ) : (
        <button
          className={`w-full py-3 ${yes ? "btn bg-yes text-white" : "btn bg-no text-white"}`}
          disabled={action.busy || amount < MIN_BET}
          onClick={placeBet}
        >
          {action.step ?? `Bet ${amountStr || 0} on ${yes ? "YES" : "NO"} from ${net.short}`}
        </button>
      )}

      {action.error && <div className="mt-2 break-words text-xs text-no">{action.error}</div>}
      {lastTx && !action.busy && (
        <div className="mt-2 text-xs text-muted">
          {lastTx.net.isHub ? (
            "Bet recorded on the hub ✓"
          ) : (
            <>
              Sent! Track the CCIP message:{" "}
              <a className="text-accent underline" href={ccipExplorerTx(lastTx.hash)} target="_blank" rel="noreferrer">
                CCIP Explorer ↗
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
