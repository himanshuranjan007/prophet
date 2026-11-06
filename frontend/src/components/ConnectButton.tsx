"use client";

import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { netByChainId } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { ChainDot } from "./ChainDot";

export function ConnectButton() {
  const { address, chainId, isConnected } = useConnection();
  const connectors = useConnectors();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) {
    const injected = connectors[0];
    return (
      <button
        className="btn-primary"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  const net = netByChainId(chainId);
  return (
    <button className="btn-ghost" onClick={() => disconnect()} title="Disconnect">
      {net ? <ChainDot net={net} /> : <span className="text-no text-xs">unsupported chain</span>}
      <span className="font-mono">{shortAddr(address)}</span>
    </button>
  );
}
