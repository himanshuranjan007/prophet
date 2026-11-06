"use client";

import { useSyncExternalStore } from "react";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address } from "viem";
import { HUB_ADDRESS, HUB_CHAIN, HUB_DEPLOY_BLOCK, assetBySymbol, type AppChain, type Asset, type Market } from "./config";
import { feedAbi, feedRelayerAbi, hubAbi, relayedFeedAbi } from "./abi";

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
    query: { enabled: n > 0, placeholderData: keepPreviousData },
  });
  const list = (markets.data ?? [])
    .map((r, id) => (r.status === "success" ? { id, ...(r.result as Market) } : null))
    .filter(Boolean) as (Market & { id: number })[];
  // count first, so a just-created market is included in the batch read
  const refetch = async () => {
    await count.refetch();
    await markets.refetch();
  };
  return { list: list.reverse(), isLoading: count.isLoading || (n > 0 && markets.isLoading), refetch };
}

export function useMarket(id: bigint) {
  const q = useReadContract({ ...hub, functionName: "getMarket", args: [id] });
  return { market: q.data as Market | undefined, ...q };
}

/** Latest Chainlink price for an asset, read from its source feed (where the real feed lives). */
export function useAssetPrice(asset: Asset | undefined) {
  const q = useReadContract({
    address: asset?.source.feed,
    abi: feedAbi,
    functionName: "latestRoundData",
    chainId: asset?.source.chainId,
    query: { enabled: !!asset },
  });
  return q.data ? { price: q.data[1], updatedAt: Number(q.data[3]), roundId: q.data[0] } : undefined;
}

export function useEthPrice() {
  return useAssetPrice(assetBySymbol("ETH"));
}

// ---------------------------------------------------------------- feed history (Chainlink rounds)

export type FeedRound = { id: bigint; price: bigint; t: number };

const LOW64 = (1n << 64n) - 1n;
const BATCH = 60;
const MAX_ROUNDS = 400;
/** Per-feed cache of rounds already fetched (ascending by time); each poll only reads new rounds. */
const roundCache = new Map<string, FeedRound[]>();

/**
 * Chainlink rounds for `feed` on `chainId` covering at least [fromSec, now], oldest first.
 * Includes the last round before `fromSec` so a step line can start at the window edge.
 * Walks round ids backwards within the current phase (proxy ids are phase<<64 | aggregatorRound).
 */
export function useFeedHistory(chainId: AppChain["id"] | undefined, feed: Address | undefined, fromSec: number, pollMs = 15_000) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["feedHistory", chainId, feed, fromSec],
    enabled: !!client && !!feed && fromSec > 0,
    refetchInterval: pollMs,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FeedRound[]> => {
      const key = `${chainId}:${feed!.toLowerCase()}`;
      let rounds = roundCache.get(key) ?? [];

      /** Read rounds walking back from `startId`, stopping when `stop` says so or the phase begins. */
      const walk = async (startId: bigint, stop: (r: FeedRound) => boolean) => {
        const out: FeedRound[] = [];
        let id = startId;
        while ((id & LOW64) > 0n && out.length < MAX_ROUNDS) {
          const ids: bigint[] = [];
          for (let k = 0; k < BATCH && (id & LOW64) > 0n; k++, id--) ids.push(id);
          const res = await client!.multicall({
            contracts: ids.map((rid) => ({ address: feed!, abi: feedAbi, functionName: "getRoundData", args: [rid] }) as const),
            allowFailure: true,
          });
          let stopped = false;
          for (const r of res) {
            if (r.status !== "success") continue;
            const [rid, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
            if (updatedAt === 0n) continue;
            const round = { id: rid, price: answer, t: Number(updatedAt) };
            out.push(round);
            if (stop(round)) {
              stopped = true;
              break;
            }
          }
          if (stopped) break;
        }
        return out;
      };

      // 1) newer rounds: walk back from latest until we reach what's cached (or, cold, until before the window)
      const [latestId] = await client!.readContract({ address: feed!, abi: feedAbi, functionName: "latestRoundData" });
      const newest = rounds[rounds.length - 1];
      if (!newest || latestId > newest.id) {
        const fresh = await walk(latestId, (r) => (newest ? r.id <= newest.id : r.t < fromSec));
        rounds = merge(rounds, fresh);
      }
      // 2) older rounds: backfill until the window (plus one round before it) is covered
      const oldest = rounds[0];
      if (oldest && oldest.t >= fromSec) rounds = merge(rounds, await walk(oldest.id - 1n, (r) => r.t < fromSec));

      rounds = rounds.slice(-MAX_ROUNDS);
      roundCache.set(key, rounds);
      const firstIn = rounds.findIndex((r) => r.t >= fromSec);
      return firstIn === -1 ? rounds.slice(-1) : rounds.slice(Math.max(0, firstIn - 1));
    },
  });
}

function merge(a: FeedRound[], b: FeedRound[]) {
  const byId = new Map<bigint, FeedRound>();
  for (const r of a) byId.set(r.id, r);
  for (const r of b) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1));
}

// ---------------------------------------------------------------- CCIP price relay (SOL)

/** State of a relayed asset: what's on Base vs what the source feed has, and the relay fee. */
export function useRelayState(asset: Asset | undefined) {
  const relayed = useReadContract({
    address: asset?.feed,
    abi: relayedFeedAbi,
    functionName: "latestRoundData",
    chainId: HUB_CHAIN.id,
    // RelayedFeed reverts NoData until the first round lands: that's a state, not a failure to retry
    query: { enabled: !!asset?.relay, retry: false },
  });
  const quote = useReadContract({
    address: asset?.relay?.relayer,
    abi: feedRelayerAbi,
    functionName: "quote",
    chainId: asset?.source.chainId,
    query: { enabled: !!asset?.relay },
  });
  if (!asset?.relay) return undefined;
  return {
    /** latest price stored on Base (undefined until the first relay lands) */
    onHub: relayed.data ? { price: relayed.data[1], t: Number(relayed.data[3]), id: relayed.data[0] } : undefined,
    hubLoading: relayed.isLoading && !relayed.isError,
    fee: quote.data?.[0],
    /** the source has a round the relayer hasn't sent yet */
    hasNew: quote.data?.[1] ?? false,
  };
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

// ---------------------------------------------------------------- in-flight CCIP messages (localStorage)
export type Pending = {
  kind: "bet" | "claim";
  srcTx: `0x${string}`;
  /** CCIP messageId from the spoke's BetSent/ClaimSent event; equals the hub's BetPlaced.ccipMessageId. */
  msgId?: `0x${string}`;
  chainId: number;
  marketId: string;
  user: Address;
  yes?: boolean;
  amount?: string;
  at: number;
};

const KEY = "prophet.pending.v2";
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
