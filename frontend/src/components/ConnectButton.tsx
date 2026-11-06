"use client";

import { useSyncExternalStore } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { netByChainId } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { ChainDot } from "./ChainDot";
import { IconExternal } from "./Doodles";

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
        <a className="btn-ghost" href={href} target="_blank" rel="noreferrer">
          <span className="hidden sm:inline">Open in MetaMask</span>
          <span className="sm:hidden">MetaMask</span>
          <IconExternal className="h-3.5 w-3.5" />
        </a>
      );
    }
    const injected = connectors[0];
    return (
      <div className="flex flex-col items-end">
        <button className="btn-primary" disabled={isPending || !injected} onClick={() => injected && connect({ connector: injected })}>
          {isPending ? (
            "Connecting…"
          ) : (
            <>
              <span className="hidden sm:inline">Connect wallet</span>
              <span className="sm:hidden">Connect</span>
            </>
          )}
        </button>
        {error && <span role="alert" className="mt-1 max-w-56 break-words text-right text-xs text-no">{error.message.split("\n")[0]}</span>}
      </div>
    );
  }
  const net = netByChainId(chainId);
  return (
    <button className="btn-ghost" onClick={() => disconnect()} title="Disconnect" aria-label={`Disconnect ${shortAddr(address)}`}>
      {net ? (
        <>
          <span className="sm:hidden">
            <ChainDot net={net} label={false} />
          </span>
          <span className="hidden sm:inline-flex">
            <ChainDot net={net} />
          </span>
          <span className="font-mono text-[0.8rem]">{shortAddr(address)}</span>
        </>
      ) : (
        <>
          <span className="text-sm font-semibold text-no">Wrong network</span>
          <span className="hidden font-mono text-[0.8rem] sm:inline">{shortAddr(address)}</span>
        </>
      )}
    </button>
  );
}
