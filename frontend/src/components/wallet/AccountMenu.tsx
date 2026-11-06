"use client";

import { useRef, useState } from "react";
import { formatUnits } from "viem";
import { useBalance, useConnection, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { NETS, netByChainId } from "@/lib/config";
import { bnmAbi } from "@/lib/abi";
import { shortAddr } from "@/lib/format";
import { ChainDot } from "../ChainDot";
import { IconCheck, IconCoins, IconExternal } from "../Doodles";
import { CopyButton } from "./ConnectModal";

const fmt = (v: bigint | undefined, decimals = 18, dp = 4) =>
  v === undefined ? "–" : Number(formatUnits(v, decimals)).toLocaleString(undefined, { maximumFractionDigits: dp });

/** Header account chip + popover (native `popover`: light-dismiss + Escape built in). */
export function AccountMenu() {
  const { address, chainId, connector } = useConnection();
  const net = netByChainId(chainId);
  const id = "account-menu";

  if (!address) return null;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className={`btn-ghost ${net ? "" : "border-no"}`}
        aria-label={`Account ${shortAddr(address)}${net ? ` on ${net.name}` : ", wrong network"}`}
      >
        {net ? (
          <>
            <span className="sm:hidden">
              <ChainDot net={net} label={false} />
            </span>
            <span className="hidden sm:inline-flex">
              <ChainDot net={net} />
            </span>
          </>
        ) : (
          <span className="text-sm font-semibold text-no">Wrong network</span>
        )}
        <span className={`font-mono text-[0.8rem] ${net ? "" : "hidden sm:inline"}`}>{shortAddr(address)}</span>
      </button>

      <div
        id={id}
        popover="auto"
        className="account-pop card-primary fixed inset-auto m-0 w-[min(21rem,calc(100vw-2rem))] p-5 text-ink"
        style={{ top: "4.25rem", right: "max(1rem, calc((100vw - 64rem) / 2 + 1rem))" }}
      >
        <MenuBody address={address} chainId={chainId} connectorName={connector?.name} connectorIcon={connector?.icon} popoverId={id} />
      </div>
    </>
  );
}

function MenuBody({
  address,
  chainId,
  connectorName,
  connectorIcon,
  popoverId,
}: {
  address: `0x${string}`;
  chainId?: number;
  connectorName?: string;
  connectorIcon?: string;
  popoverId: string;
}) {
  const net = netByChainId(chainId);
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [switching, setSwitching] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const self = useRef<HTMLDivElement>(null);

  const eth = useBalance({ address, chainId: net?.chain.id, query: { enabled: !!net } });
  const bnm = useReadContract({
    address: net?.bnm,
    abi: bnmAbi,
    functionName: "balanceOf",
    args: [address],
    chainId: net?.chain.id,
    query: { enabled: !!net },
  });

  const switchTo = async (id: number) => {
    setErr(null);
    setSwitching(id);
    try {
      await switchChainAsync({ chainId: id as (typeof NETS)[number]["chain"]["id"] });
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "";
      setErr(/reject|denied|cancel/i.test(m) ? "Cancelled in your wallet." : m.split("\n")[0]);
    } finally {
      setSwitching(null);
    }
  };

  const explorer = net?.chain.blockExplorers?.default.url;

  return (
    <div ref={self} className="space-y-4">
      {/* who */}
      <div className="flex items-center gap-3">
        {connectorIcon ? (
          // eslint-disable-next-line @next/next/no-img-element -- EIP-6963 icons are inline data: URIs
          <img src={connectorIcon} alt="" className="h-8 w-8 rounded-md" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ink text-on-ink">
            <span className="text-xs font-bold">{address.slice(2, 4).toUpperCase()}</span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{connectorName ? `Connected · ${connectorName}` : "Connected"}</div>
          <div className="truncate font-mono text-[0.85rem]">{shortAddr(address)}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={address} label="Copy address" className="chip" />
        {explorer && (
          <a className="chip" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
            Explorer <IconExternal className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* balances on the current chain */}
      {net ? (
        <div className="rule pt-3">
          <div className="eyebrow mb-1.5">On {net.name}</div>
          <div className="num flex items-baseline gap-4">
            <span>
              <span className="text-lg font-bold">{fmt(eth.data?.value, eth.data?.decimals ?? 18)}</span>{" "}
              <span className="text-sm text-muted">{net.chain.nativeCurrency.symbol}</span>
            </span>
            <span>
              <span className="text-lg font-bold">{fmt(bnm.data as bigint | undefined, 18, 3)}</span>{" "}
              <span className="text-sm text-muted">BnM</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="rule pt-3 text-sm text-no">Your wallet is on a network Prophet doesn&apos;t use. Pick one below.</p>
      )}

      {/* network */}
      <div className="rule pt-3">
        <div className="eyebrow mb-1">Network</div>
        <ul className="divide-y divide-dashed divide-line">
          {NETS.map((n) => {
            const on = n.chain.id === chainId;
            return (
              <li key={n.chain.id}>
                <button
                  type="button"
                  disabled={on || switching !== null}
                  aria-pressed={on}
                  onClick={() => switchTo(n.chain.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-(--dur-quick) ${on ? "bg-hl/40" : "hover:bg-ink/5"} disabled:cursor-default`}
                >
                  <ChainDot net={n} label={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{n.name}</span>
                    <span className="block text-xs text-muted">{n.isHub ? "The pool · instant bets" : `Bets travel via CCIP · ${n.eta}`}</span>
                  </span>
                  {on ? (
                    <IconCheck className="h-4 w-4 shrink-0" />
                  ) : switching === n.chain.id ? (
                    <span className="text-xs text-muted">Confirm…</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {err && <p className="mt-1 text-sm text-muted">{err}</p>}
      </div>

      {/* footer */}
      <div className="rule flex items-center justify-between gap-3 pt-3">
        <a className="btn-quiet -ml-2" href="https://faucets.chain.link" target="_blank" rel="noreferrer">
          <IconCoins className="h-4 w-4" />
          Test tokens
        </a>
        <button
          type="button"
          className="btn-quiet -mr-2 hover:text-no"
          onClick={() => {
            (document.getElementById(popoverId) as HTMLElement & { hidePopover?: () => void })?.hidePopover?.();
            disconnect();
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
