"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { encode } from "uqr";
import { useConnect, useConnection, useConnectors, type Connector } from "wagmi";
import { walletModal, useWalletModal } from "@/lib/walletModal";
import { CrystalBall, IconBack, IconCheck, IconChevron, IconClose, IconCopy, IconExternal, IconQr, IconWallet } from "../Doodles";

/** One app-wide "connect a wallet" dialog. Opened from anywhere via walletModal.open(). */
export function ConnectModal() {
  const { open, nonce } = useWalletModal();
  const ref = useRef<HTMLDialogElement>(null);

  // sync the store with the native <dialog> (focus trap, Escape, top layer for free)
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="wallet-title"
      onClose={() => walletModal.close()}
      // a click on the dialog element itself (not its content) is a click on the backdrop
      onClick={(e) => e.target === ref.current && walletModal.close()}
      className="wallet-dialog m-auto w-[min(27rem,calc(100vw-2rem))] overflow-visible bg-transparent p-0 text-ink backdrop:bg-ink/25 backdrop:backdrop-blur-[1px]"
    >
      {open && <ConnectBody key={nonce} />}
    </dialog>
  );
}

type Err = { msg: string; cancelled: boolean };

const isRejection = (e: unknown) => {
  const err = e as { name?: string; message?: string; shortMessage?: string; code?: number };
  return (
    err?.name === "UserRejectedRequestError" ||
    err?.code === 4001 ||
    /reject|denied|cancel|closed/i.test(`${err?.shortMessage ?? ""} ${err?.message ?? ""}`)
  );
};

function ConnectBody() {
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { isConnected } = useConnection();
  const [busy, setBusy] = useState<Connector | null>(null);
  const [error, setError] = useState<Err | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  // connected by any route (e.g. a phone scanned the QR): we're done
  useEffect(() => {
    if (isConnected && busy) walletModal.close();
  }, [isConnected, busy]);

  // EIP-6963 wallets carry their own name + icon; the generic one is only useful when none announced
  const announced = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const generic = connectors.find((c) => c.id === "injected");
  const hasWindowEthereum = typeof window !== "undefined" && "ethereum" in window;
  const browser = announced.length ? announced : generic && hasWindowEthereum ? [generic] : [];
  const base = connectors.find((c) => c.id === "baseAccount");
  const wc = connectors.find((c) => c.id === "walletConnect");

  async function connect(c: Connector) {
    setError(null);
    setBusy(c);
    let off: (() => void) | undefined;
    if (c.id === "walletConnect") {
      const onMessage = ({ type, data }: { type: string; data?: unknown }) => {
        if (type === "display_uri" && typeof data === "string") setQr(data);
      };
      c.emitter.on("message", onMessage);
      off = () => c.emitter.off("message", onMessage);
    }
    try {
      await connectAsync({ connector: c });
      walletModal.close();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError({ msg: (err.shortMessage ?? err.message ?? "Couldn't connect").split("\n")[0], cancelled: isRejection(e) });
      setQr(null);
    } finally {
      off?.();
      setBusy(null);
    }
  }

  // ------------------------------------------------------------------ QR view (WalletConnect)
  if (qr && busy?.id === "walletConnect") {
    return (
      <Shell title="Scan with your wallet" onBack={() => { setQr(null); setBusy(null); }}>
        <div className="mx-auto w-fit rounded-xl bg-[#fffdf7] p-3 sketch-thin">
          <Qr value={qr} />
        </div>
        <p className="text-center text-sm text-muted">Open your wallet app on your phone and scan the code.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton text={qr} label="Copy link" />
          <a href={qr} className="btn-ghost pointer-fine:hidden">
            <IconExternal className="h-4 w-4" />
            Open wallet app
          </a>
        </div>
      </Shell>
    );
  }

  // ------------------------------------------------------------------ list view
  return (
    <Shell title="Connect a wallet">
      {browser.length > 0 ? (
        <Group label="Browser wallet">
          {browser.map((c, i) => (
            <Row
              key={c.uid}
              autoFocus={i === 0}
              icon={c.icon ? (
                // eslint-disable-next-line @next/next/no-img-element -- EIP-6963 icons are inline data: URIs
                <img src={c.icon} alt="" className="h-7 w-7 rounded-md" />
              ) : <IconWallet className="h-6 w-6" />}
              name={c.id === "injected" ? "Browser wallet" : c.name}
              hint="Detected"
              busy={busy?.uid === c.uid}
              disabled={!!busy}
              onClick={() => connect(c)}
            />
          ))}
        </Group>
      ) : (
        <NoBrowserWallet />
      )}

      {(base || wc) && (
        <Group label="Other ways">
          {base && (
            <Row
              autoFocus={browser.length === 0}
              icon={<BaseMark />}
              name="Base Account"
              hint="Passkey smart wallet, no extension"
              busy={busy?.uid === base.uid}
              disabled={!!busy}
              onClick={() => connect(base)}
            />
          )}
          {wc && (
            <Row
              icon={<IconQr className="h-6 w-6" />}
              name="WalletConnect"
              hint="Phone wallets, scan a QR"
              busy={busy?.uid === wc.uid}
              disabled={!!busy}
              onClick={() => connect(wc)}
            />
          )}
        </Group>
      )}

      {error && (
        <p role="alert" className={`break-words text-sm ${error.cancelled ? "text-muted" : "text-no"}`}>
          {error.cancelled ? "Cancelled in your wallet." : error.msg}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Prophet runs on testnets (Base, Arbitrum and Ethereum Sepolia). No real money: grab free test tokens once connected.
      </p>
    </Shell>
  );
}

// ==================================================================== pieces

function Shell({ title, onBack, children }: { title: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="card-primary space-y-5 p-6">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button type="button" className="btn-quiet -ml-2" onClick={onBack} aria-label="Back to wallets">
            <IconBack className="h-4 w-4" />
          </button>
        ) : (
          <CrystalBall className="h-8 w-8 shrink-0" />
        )}
        <h2 id="wallet-title" className="flex-1 font-display text-head">
          {title}
        </h2>
        <button type="button" className="btn-quiet -mr-2" onClick={() => walletModal.close()} aria-label="Close">
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <ul className="divide-y divide-dashed divide-line">{children}</ul>
    </div>
  );
}

function Row({
  autoFocus,
  icon,
  name,
  hint,
  busy,
  disabled,
  onClick,
}: {
  autoFocus?: boolean;
  icon: React.ReactNode;
  name: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        autoFocus={autoFocus}
        onClick={onClick}
        disabled={disabled}
        aria-busy={busy}
        className="group flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors duration-(--dur-quick) hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:opacity-100"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{name}</span>
          <span className="block truncate text-sm text-muted">{busy ? `Approve in ${name}…` : hint}</span>
        </span>
        {busy ? (
          <CrystalBall className="wiggle h-6 w-6 shrink-0" />
        ) : (
          <IconChevron className="h-4 w-4 shrink-0 text-muted transition-transform duration-(--dur-quick) group-hover:translate-x-0.5" />
        )}
      </button>
    </li>
  );
}

function NoBrowserWallet() {
  const mmDeepLink =
    typeof window !== "undefined" ? `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}` : "#";
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">No browser wallet found.</span>{" "}
        <span className="text-muted">Install one, or use a passkey wallet below.</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="chip" href="https://metamask.io/download" target="_blank" rel="noreferrer">
          MetaMask <IconExternal className="h-3.5 w-3.5" />
        </a>
        <a className="chip" href="https://rabby.io" target="_blank" rel="noreferrer">
          Rabby <IconExternal className="h-3.5 w-3.5" />
        </a>
        <a className="chip pointer-fine:hidden" href={mmDeepLink} target="_blank" rel="noreferrer">
          Open in MetaMask app <IconExternal className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

/** Base mark drawn in the house pen style (blue square, rounded). */
function BaseMark() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
      <path d="M5 4.6c6.2-.4 12.2-.3 18.3.1.5 6.2.6 12.4.1 18.6-6.1.5-12.2.4-18.3 0-.4-6.2-.5-12.5-.1-18.7z" fill="#0052ff" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** QR in fixed ink-on-paper colours (scanners need dark-on-light, whatever the theme). */
function Qr({ value }: { value: string }) {
  const { path, size } = useMemo(() => {
    const { data } = encode(value, { ecc: "M", border: 1 });
    let d = "";
    data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, size: data.length };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="block h-56 w-56" shapeRendering="crispEdges" role="img" aria-label="WalletConnect QR code">
      <rect width={size} height={size} fill="#fffdf7" />
      <path d={path} fill="#221f1a" />
    </svg>
  );
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className ?? "btn-ghost"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {}
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
      {done ? "Copied" : label}
    </button>
  );
}
