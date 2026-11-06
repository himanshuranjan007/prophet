import type { Net } from "@/lib/config";

/** A hand-coloured blob + chain name. */
export function ChainDot({ net, label = true }: { net: Net; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-hand text-base leading-none">
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
        <path d="M7 1.2c3.4-.2 5.9 2.4 5.7 5.6-.2 3.3-2.8 5.6-5.9 5.4C3.6 12 1.2 9.6 1.4 6.6 1.6 3.6 3.9 1.4 7 1.2z" fill={net.color} stroke="currentColor" strokeWidth="1.3" />
      </svg>
      {label && net.short}
    </span>
  );
}
