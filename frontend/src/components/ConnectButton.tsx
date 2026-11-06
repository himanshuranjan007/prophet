"use client";

import { useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { netByChainId } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { ChainDot } from "./ChainDot";

// after mount only (server snapshot = "unknown"), so SSR and first client render match
const hasWallet = () => (typeof window !== "undefined" && "ethereum" in window ? "yes" : "no");

export function ConnectButton() {
  const { address, chainId, isConnected } = useConnection();
  const connectors = useConnectors();
  const { connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const wallet = useSyncExternalStore(
    () => () => {},
    hasWallet,
    () => "unknown",
  );

  if (!isConnected || !address) {
    if (wallet === "no" || error?.message.toLowerCase().includes("provider not found")) {
      const href = typeof window !== "undefined" ? `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}` : "#";
      return (
        <a className="btn-ghost rotate-1" href={href} target="_blank" rel="noreferrer">
          no wallet? open in MetaMask ↗
        </a>
      );
    }
    const injected = connectors[0];
    return (
      <div className="flex flex-col items-end">
        <button className="btn-primary rotate-1" disabled={isPending || !injected} onClick={() => injected && connect({ connector: injected })}>
          {isPending ? "connecting…" : "Connect wallet"}
        </button>
        {error && <span className="mt-1 max-w-56 text-right font-hand text-sm text-no">{error.message.split("\n")[0]}</span>}
      </div>
    );
  }
  const net = netByChainId(chainId);
  return (
    <button className="btn-ghost -rotate-1" onClick={() => disconnect()} title="Disconnect">
      {net ? <ChainDot net={net} /> : <span className="font-hand text-no">wrong network</span>}
      <span className="font-mono text-sm">{shortAddr(address)}</span>
    </button>
  );
}
