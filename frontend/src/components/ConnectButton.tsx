"use client";

import { useConnection } from "wagmi";
import { walletModal } from "@/lib/walletModal";
import { IconWallet } from "./Doodles";
import { AccountMenu } from "./wallet/AccountMenu";

/** Header wallet control: "Connect wallet" opens the modal; once connected, the account menu. */
export function ConnectButton() {
  const { isConnected, status } = useConnection();

  if (isConnected) return <AccountMenu />;
  return (
    <button type="button" className="btn-primary" disabled={status === "reconnecting"} onClick={() => walletModal.open()}>
      <IconWallet className="h-4 w-4" />
      {status === "reconnecting" ? (
        "Reconnecting…"
      ) : (
        <>
          <span className="hidden sm:inline">Connect wallet</span>
          <span className="sm:hidden">Connect</span>
        </>
      )}
    </button>
  );
}
