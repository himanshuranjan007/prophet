"use client";

import { useSyncExternalStore } from "react";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { ETH_USD_FEED, HUB_ADDRESS, HUB_CHAIN, HUB_DEPLOY_BLOCK, type Market } from "./config";
import { feedAbi, hubAbi } from "./abi";

const hub = { address: HUB_ADDRESS, abi: hubAbi, chainId: HUB_CHAIN.id } as const;

// one shared 1s clock; server snapshot is 0 so prerender never reads the current time
let nowSec = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const clockSubs = new Set<() => void>();
function subscribeClock(cb: () => void) {
  clockSubs.add(cb);
  if (!timer) {
    nowSec = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      nowSec = Math.floor(Date.now() / 1000);
      clockSubs.forEach((f) => f());
    }, 1000);
  }
  return () => {
    clockSubs.delete(cb);
    if (clockSubs.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow() {
  return useSyncExternalStore(subscribeClock, () => nowSec, () => 0);
}

export function useMarkets() {
  const count = useReadContract({ ...hub, functionName: "marketCount" });
  const n = Number(count.data ?? 0n);
  const markets = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ ...hub, functionName: "getMarket", args: [BigInt(i)] }) as const),
    query: { enabled: n > 0 },
  });
  const list = (markets.data ?? [])
    .map((r, id) => (r.status === "success" ? { id, ...(r.result as Market) } : null))
    .filter(Boolean) as (Market & { id: number })[];
  return { list: list.reverse(), isLoading: count.isLoading || markets.isLoading, refetch: markets.refetch };
}

export function useMarket(id: bigint) {
  const q = useReadContract({ ...hub, functionName: "getMarket", args: [id] });
  return { market: q.data as Market | undefined, ...q };
}

export function useEthPrice() {
  const q = useReadContract({ address: ETH_USD_FEED, abi: feedAbi, functionName: "latestRoundData", chainId: HUB_CHAIN.id });
  return q.data ? { price: q.data[1], updatedAt: Number(q.data[3]) } : undefined;
}

export type BetLog = {
  user: Address;
  chainSelector: bigint;
  yes: boolean;
  amount: bigint;
  ccipMessageId: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
};

const betPlaced = parseAbiItem(
  "event BetPlaced(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, bool yes, uint256 amount, bytes32 ccipMessageId)",
);

/** All BetPlaced events for a market, newest first. Paged to stay under public-RPC log range limits. */
export function useBetLogs(marketId: bigint) {
  const client = usePublicClient({ chainId: HUB_CHAIN.id });
  return useQuery({
    queryKey: ["bets", marketId.toString()],
    enabled: !!client,
    refetchInterval: 15_000,
    queryFn: async (): Promise<BetLog[]> => {
      const latest = await client!.getBlockNumber();
      const out: BetLog[] = [];
      const STEP = 9_999n;
      for (let from = HUB_DEPLOY_BLOCK; from <= latest; from += STEP + 1n) {
        const to = from + STEP > latest ? latest : from + STEP;
        const logs = await client!.getLogs({ address: HUB_ADDRESS, event: betPlaced, args: { marketId }, fromBlock: from, toBlock: to });
        for (const l of logs)
          out.push({
            user: l.args.user!,
            chainSelector: l.args.chainSelector!,
            yes: l.args.yes!,
            amount: l.args.amount!,
            ccipMessageId: l.args.ccipMessageId!,
            txHash: l.transactionHash,
            blockNumber: l.blockNumber,
          });
      }
      return out.reverse();
    },
  });
}

// ---------------------------------------------------------------- in-flight CCIP bets (localStorage)
export type Pending = {
  srcTx: `0x${string}`;
  chainId: number;
  marketId: string;
  user: Address;
  yes: boolean;
  amount: string;
  /** hub position (yes+no) for this user/chain at submit time; landed when it grows by `amount`. */
  baseline: string;
  at: number;
};

const KEY = "crosscall.pending";
const listeners = new Set<() => void>();
let cache: Pending[] | null = null;

function read(): Pending[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
}
function write(v: Pending[]) {
  cache = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  listeners.forEach((l) => l());
}
const EMPTY: Pending[] = [];

export function usePending() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY,
  );
  return {
    list,
    add: (p: Pending) => write([p, ...read()]),
    remove: (srcTx: string) => write(read().filter((p) => p.srcTx !== srcTx)),
  };
}
