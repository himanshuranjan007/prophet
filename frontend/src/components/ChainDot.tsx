import type { Net } from "@/lib/config";

export function ChainDot({ net, label = true }: { net: Net; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-2 w-2 rounded-full" style={{ background: net.color }} />
      {label && net.short}
    </span>
  );
}
