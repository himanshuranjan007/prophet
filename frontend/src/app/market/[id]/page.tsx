import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketView } from "@/components/MarketView";
import { getMarket } from "@/lib/server";
import { fmtToken, odds } from "@/lib/format";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
};

const validId = (id: string) => /^\d{1,9}$/.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!validId(id)) return { title: "Market not found · Crosscall" };
  const m = await getMarket(id);
  if (!m) return { title: "Market not found · Crosscall" };
  const o = odds(m);
  const description = `YES ${o.yesPct.toFixed(0)}% · NO ${o.noPct.toFixed(0)}% · pool ${fmtToken(o.total)}. Bet from Base, Arbitrum or Ethereum. One pool via Chainlink CCIP.`;
  return {
    title: `${m.question} · Crosscall`,
    description,
    openGraph: { title: m.question, description },
    twitter: { card: "summary_large_image", title: m.question, description },
  };
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading market…</div>}>
      <MarketPage {...props} />
    </Suspense>
  );
}

async function MarketPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const side = sp.side === "yes" || sp.side === "no" ? sp.side : undefined;
  const from = typeof sp.from === "string" && /^0x[0-9a-fA-F]{40}$/.test(sp.from) ? sp.from : undefined;
  if (!validId(id)) return <div className="text-sm text-muted">Market not found.</div>;
  return <MarketView id={id} side={side} from={from} />;
}
