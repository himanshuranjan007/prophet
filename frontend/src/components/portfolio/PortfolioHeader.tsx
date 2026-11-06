"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { isAddress } from "viem";
import { useConnection } from "wagmi";
import { NETS } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { walletModal } from "@/lib/walletModal";
import { ChainDot } from "../ChainDot";
import { IconBack, IconWallet } from "../Doodles";
import { ExternalLink } from "../ui";
import { CopyButton } from "../wallet/ConnectModal";

/** Back link, title and whose wallet this is. Without an address: a calm "connect or look one up" card. */
export function PortfolioHeader({ address, isSelf, reconnecting }: { address?: `0x${string}`; isSelf: boolean; reconnecting: boolean }) {
  return (
    <div>
      <nav aria-label="Portfolio" className="text-sm">
        <Link href="/" className="btn-quiet -ml-2">
          <IconBack className="h-4 w-4" />
          All markets
        </Link>
      </nav>

      <h1 className="mt-4 break-words font-display text-title">
        {isSelf || !address ? (
          "Your positions"
        ) : (
          <>
            Positions <span className="whitespace-nowrap font-mono text-[0.5em] tracking-normal">{shortAddr(address)}</span>
          </>
        )}
      </h1>

      {address ? <WalletMeta address={address} isSelf={isSelf} reconnecting={reconnecting} /> : <ConnectPrompt reconnecting={reconnecting} />}
    </div>
  );
}

function WalletMeta({ address, isSelf, reconnecting }: { address: `0x${string}`; isSelf: boolean; reconnecting: boolean }) {
  const { address: connected } = useConnection();
  // while the wallet reconnects we don't know yet whether this is the viewer's own wallet
  const other = !isSelf && !reconnecting;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[0.8rem]" title={address}>
          <span className="hidden sm:inline">{address}</span>
          <span className="sm:hidden">{shortAddr(address)}</span>
        </span>
        <CopyButton text={address} label="Copy address" className="chip hover:bg-ink/5" />
        <ul aria-label="This wallet on block explorers" className="flex flex-wrap items-center gap-2">
          {NETS.map((n) => (
            <li key={n.chain.id}>
              <ExternalLink
                href={`${n.chain.blockExplorers.default.url}/address/${address}`}
                title={`Open on the ${n.name} explorer`}
                className="chip hover:bg-ink/5"
              >
                <ChainDot net={n} />
                <span className="sr-only"> explorer</span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-sm text-muted">
        Read from the hub on Base and from Arbitrum and Ethereum Sepolia, whatever network your wallet is on.
      </p>
      {other && (
        <p className="mt-1 text-sm text-muted">
          You&apos;re viewing another wallet. Claims are only available to its owner.{" "}
          {connected ? (
            <Link href="/portfolio" className="link font-semibold text-ink">
              See your own positions
            </Link>
          ) : (
            <button type="button" className="link font-semibold text-ink" onClick={() => walletModal.open()}>
              Connect your wallet
            </button>
          )}
        </p>
      )}

      <LookupToggle />
    </>
  );
}

/** Disconnected and no wallet in the URL: connect, or read any wallet by address. */
function ConnectPrompt({ reconnecting }: { reconnecting: boolean }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="card mt-8 max-w-xl p-6">
      <h2 id={titleId} className="font-display text-head">
        See every call you&apos;ve made
      </h2>
      <p className="mt-2 text-muted">
        Connect a wallet to see your open bets, winnings to claim and CCIP trips on Base, Arbitrum and Ethereum, whatever
        network it&apos;s on.
      </p>
      <button type="button" className="btn-primary mt-6" disabled={reconnecting} onClick={() => walletModal.open()}>
        <IconWallet className="h-4 w-4" />
        {reconnecting ? "Reconnecting…" : "Connect wallet"}
      </button>
      <div className="rule my-6" />
      <LookupForm label="or look up any wallet" />
    </section>
  );
}

/** "Look up another wallet": a quiet toggle that reveals the address form. */
function LookupToggle() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) toggleRef.current?.focus();
  };

  return (
    <div className="mt-3">
      <button
        ref={toggleRef}
        type="button"
        className="btn-quiet -ml-2"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <IconWallet className="h-4 w-4" />
        Look up another wallet
      </button>
      <div id={panelId} hidden={!open} className="mt-2 max-w-md">
        {open && <LookupForm label="Wallet address" hideLabel autoFocus onDone={() => close(false)} onCancel={() => close(true)} />}
      </div>
    </div>
  );
}

function LookupForm({
  label,
  hideLabel,
  autoFocus,
  onDone,
  onCancel,
}: {
  label: string;
  hideLabel?: boolean;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const errorId = useId();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const addr = value.trim();
    if (!isAddress(addr)) {
      setError(
        !addr
          ? "Paste a wallet address first."
          : isAddress(addr, { strict: false })
            ? "That address has a typo: its checksum doesn't match."
            : "That isn't a wallet address. It starts with 0x and has 40 hex characters.",
      );
      return;
    }
    setError(null);
    startTransition(() => router.push(`/portfolio/${addr}`));
    setValue("");
    onDone?.();
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "mb-2 block text-sm text-muted"}>
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // only when the user just opened the form with the toggle
          autoFocus={autoFocus}
          placeholder="0x…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="field min-w-0 flex-1 font-mono text-base sm:text-sm"
        />
        <button type="submit" className="btn-ghost shrink-0" disabled={pending}>
          {pending ? "Opening…" : "View"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-no">
          {error}
        </p>
      )}
    </form>
  );
}
