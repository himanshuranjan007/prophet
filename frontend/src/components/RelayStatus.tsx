"use client";

import { useState } from "react";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { formatEther } from "viem";
import { ccipExplorerTx, netByChainId, type Asset } from "@/lib/config";
import { feedRelayerAbi } from "@/lib/abi";
import { fmtUsd } from "@/lib/format";
import { useAssetPrice, useRelayState } from "@/lib/hooks";
import { useAction } from "@/lib/useAction";
import { walletModal } from "@/lib/walletModal";
import { IconPlane } from "./Doodles";
import { ActionError, ExternalLink } from "./ui";

const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60));
  return m < 90 ? `${m}m ago` : `${(m / 60).toFixed(1)}h ago`;
};

/** For relayed assets (SOL): the price the hub will settle on, and a button to push the newest
 *  Chainlink round from the source chain over CCIP. Anyone can relay; they pay the CCIP fee. */
export function RelayStatus({ asset, now }: { asset: Asset; now: number }) {
  const config = useConfig();
  const { address, chainId, isConnected } = useConnection();
  const { switchChainAsync } = useSwitchChain();
  const relay = useRelayState(asset);
  const source = useAssetPrice(asset);
  const action = useAction();
  const [sent, setSent] = useState<string | null>(null);

  if (!asset.relay || !relay) return null;
  const src = netByChainId(asset.source.chainId)!;
  // Base is behind the source feed; `hasNew` = that round hasn't been sent yet (else it's already in flight)
  const behind = !!source && (!relay.onHub || source.updatedAt > relay.onHub.t);
  // Base takes rounds strictly in order: fill the next missing round first, else push the latest
  const gap = relay.gap !== undefined && source && relay.gap <= source.roundId ? relay.gap : undefined;
  const canRelay = behind && (gap !== undefined || relay.hasNew);
  const inFlight = behind && !canRelay && !sent;

  const push = () =>
    action.run(async (step) => {
      if (!address) throw new Error("Connect a wallet first");
      step(`Switching to ${src.short}…`);
      if (chainId !== src.chain.id) await switchChainAsync({ chainId: src.chain.id });
      step("Quoting the CCIP fee…");
      const relayer = asset.relay!.relayer;
      let h: `0x${string}`;
      if (gap !== undefined) {
        const fee = await readContract(config, { address: relayer, abi: feedRelayerAbi, functionName: "quoteRound", args: [gap], chainId: src.chain.id });
        step("Confirm the relay in your wallet…");
        h = await writeContract(config, {
          address: relayer,
          abi: feedRelayerAbi,
          functionName: "relayRound",
          args: [gap],
          value: (fee * 12n) / 10n, // buffer; the relayer refunds the excess
          chainId: src.chain.id,
        });
      } else {
        const [fee, hasNew] = await readContract(config, { address: relayer, abi: feedRelayerAbi, functionName: "quote", chainId: src.chain.id });
        if (!hasNew) throw new Error("The latest price is already on its way to Base.");
        step("Confirm the relay in your wallet…");
        h = await writeContract(config, {
          address: relayer,
          abi: feedRelayerAbi,
          functionName: "relay",
          value: (fee * 12n) / 10n,
          chainId: src.chain.id,
        });
      }
      step("Sending over CCIP…");
      await waitForTransactionReceipt(config, { hash: h, chainId: src.chain.id });
      setSent(h);
    });

  return (
    <div className="card space-y-2 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0">
          <span className="font-semibold">Settles on the copy on Base</span>
          <span className="text-muted">
            {" "}
            · {asset.symbol}/USD is relayed from {src.short} over CCIP ({asset.relay.lag})
          </span>
        </p>
        {canRelay && !sent && (
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={isConnected && action.busy} onClick={isConnected ? push : () => walletModal.open()}>
            <IconPlane className="h-4 w-4" />
            {action.step ?? (isConnected ? (gap !== undefined ? "Relay next price" : "Relay latest price") : "Connect to relay")}
          </button>
        )}
      </div>
      <p className="num text-muted">
        On Base:{" "}
        {relay.onHub ? (
          <>
            <span className="font-semibold text-ink">{fmtUsd(relay.onHub.price)}</span> from {ago(relay.onHub.t, now)}
          </>
        ) : relay.hubLoading ? (
          "…"
        ) : (
          "no price relayed yet"
        )}
        {source && (
          <>
            {" "}
            · on {src.short}: <span className="font-semibold text-ink">{fmtUsd(source.price)}</span> from {ago(source.updatedAt, now)}
          </>
        )}
        {canRelay && relay.fee !== undefined && !sent && <> · relay fee ≈ {Number(formatEther(relay.fee)).toFixed(6)} ETH</>}
      </p>
      {inFlight && (
        <p className="flex flex-wrap items-center gap-x-2 text-muted">
          <IconPlane className="wiggle h-4 w-4 text-ink" /> The latest {asset.symbol} price is already on its way to Base ({asset.relay.lag}).
        </p>
      )}
      {sent && (
        <p className="flex flex-wrap items-center gap-x-2 text-muted">
          <IconPlane className="wiggle h-4 w-4 text-ink" /> Relaying over CCIP, lands on Base in {asset.relay.lag}.
          <ExternalLink href={ccipExplorerTx(sent)}>Track</ExternalLink>
        </p>
      )}
      <ActionError action={action} />
    </div>
  );
}
