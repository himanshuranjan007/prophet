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
const CHUNK = 250; // getRoundData calls per multicall (sequential: public RPCs rate-limit bursts)
const MAX_WINDOW = 3_000n; // rounds per request (24h of BTC is ~500)
const MAX_CACHE = 8_000; // rounds kept per feed (by recency of updatedAt)
const PROBES = 18; // exponential probes: 1, 2, 4 … 131,072 rounds back

type FeedCache = { rounds: Map<bigint, FeedRound>; anchors: Map<number, bigint> };
/** Per-feed cache: rounds by id (never partial: a failed chunk throws and is retried) + window anchors. */
const caches = new Map<string, FeedCache>();

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

async function readRounds(client: Client, feed: Address, ids: bigint[]): Promise<FeedRound[]> {
  const out: FeedRound[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    // allowFailure: false -> any failed call rejects the query (React Query retries) instead of leaving holes
    const res = await client.multicall({
      contracts: ids
        .slice(i, i + CHUNK)
        .map((rid) => ({ address: feed, abi: feedAbi, functionName: "getRoundData", args: [rid] }) as const),
      allowFailure: false,
    });
    for (const r of res) {
      const [rid, answer, , updatedAt] = r as readonly [bigint, bigint, bigint, bigint, bigint];
      if (updatedAt > 0n) out.push({ id: rid, price: answer, t: Number(updatedAt) });
    }
  }
  return out;
}

/**
 * Bracket `target` with one multicall: probe rounds 2^k - 1 back from `latest` (within the phase).
 * Returns [lo, hi] with t(lo) < target <= t(hi) (lo = phase start if nothing is older than target).
 * updatedAt is monotonic within a phase, so the window start lies in (lo, hi].
 */
async function bracket(client: Client, feed: Address, target: number, first: bigint, latest: bigint) {
  const ids = [...new Set(Array.from({ length: PROBES }, (_, k) => {
    const id = latest - ((1n << BigInt(k)) - 1n);
    return id >= first ? id : first;
  }))]; // descending
  const got = await readRounds(client, feed, ids);
  let lo = first;
  let hi = latest;
  for (const r of got.sort((a, b) => (a.id > b.id ? -1 : 1))) {
    if (r.t < target) {
      lo = r.id;
      break;
    }
    hi = r.id;
  }
  return [lo, hi] as const;
}

/**
 * Chainlink rounds for `feed` on `chainId` covering [fromSec, toSec ?? now], oldest first, including
 * the last round before `fromSec` so a step line can start at the window edge.
 * Proxy round ids are phase<<64 | aggregatorRound and contiguous within a phase, so a window is an id
 * range: one probe brackets its start, then only ids not yet cached are read (~4 calls cold for 24h,
 * 1-2 per poll after).
 */
export function useFeedHistory(
  chainId: AppChain["id"] | undefined,
  feed: Address | undefined,
  fromSec: number,
  pollMs = 15_000,
  toSec?: number,
) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["feedHistory", chainId, feed, fromSec, toSec],
    enabled: !!client && !!feed && fromSec > 0,
    refetchInterval: pollMs, // cheap: one latestRoundData + only ids not cached
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FeedRound[]> => {
      const key = `${chainId}:${feed!.toLowerCase()}`;
      const c = caches.get(key) ?? { rounds: new Map(), anchors: new Map() };
      caches.set(key, c);

      const [latestId] = await client!.readContract({ address: feed!, abi: feedAbi, functionName: "latestRoundData" });
      const first = latestId - (latestId & LOW64) + 1n; // first round of the current phase

      // range to read: [lo, hi]
      let lo = c.anchors.get(fromSec);
      if (lo === undefined) lo = (await bracket(client!, feed!, fromSec, first, latestId))[0];
      let hi = latestId;
      if (toSec !== undefined) {
        const e = c.anchors.get(-toSec);
        hi = e ?? (await bracket(client!, feed!, toSec + 1, first, latestId))[1];
      }
      if (hi - lo > MAX_WINDOW) lo = hi - MAX_WINDOW;

      const missing: bigint[] = [];
      for (let id = lo; id <= hi; id++) if (!c.rounds.has(id)) missing.push(id);
      for (const r of await readRounds(client!, feed!, missing)) c.rounds.set(r.id, r);

      // exact edges from what we now hold
      const inRange: FeedRound[] = [];
      for (let id = lo; id <= hi; id++) {
        const r = c.rounds.get(id);
        if (r) inRange.push(r);
      }
      inRange.sort((x, y) => x.t - y.t || (x.id < y.id ? -1 : 1));
      const startIdx = Math.max(0, inRange.findLastIndex((r) => r.t < fromSec));
      c.anchors.set(fromSec, inRange[startIdx]?.id ?? lo);
      let out = inRange.slice(startIdx);
      if (toSec !== undefined) {
        const endIdx = out.findLastIndex((r) => r.t <= toSec);
        const endId = out[endIdx]?.id;
        // only final once a later round exists; until then rounds can still land inside the window
        if (endId !== undefined && endId < latestId) c.anchors.set(-toSec, endId);
        out = out.slice(0, endIdx + 1);
      }

      if (c.rounds.size > MAX_CACHE) {
        const keep = [...c.rounds.values()].sort((x, y) => y.t - x.t).slice(0, MAX_CACHE);
        c.rounds = new Map(keep.map((r) => [r.id, r]));
      }
      return out;
    },
  });
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
  // ordered mirror: which source round Base is waiting for next (legacy mirrors don't expose this)
  const lastSrc = useReadContract({
    address: asset?.feed,
    abi: relayedFeedAbi,
    functionName: "lastSourceRound",
    chainId: HUB_CHAIN.id,
    query: { enabled: !!asset?.relay, retry: false },
  });
  const nextSrc = lastSrc.data && lastSrc.data > 0n ? lastSrc.data + 1n : undefined;
  const nextSent = useReadContract({
    address: asset?.relay?.relayer,
    abi: feedRelayerAbi,
    functionName: "sent",
    args: nextSrc !== undefined ? [nextSrc] : undefined,
    chainId: asset?.source.chainId,
    query: { enabled: !!asset?.relay && nextSrc !== undefined, retry: false },
  });
  if (!asset?.relay) return undefined;
  return {
    /** latest price stored on Base (undefined until the first relay lands) */
    onHub: relayed.data ? { price: relayed.data[1], t: Number(relayed.data[3]), id: relayed.data[0] } : undefined,
    hubLoading: relayed.isLoading && !relayed.isError,
    fee: quote.data?.[0],
    /** the source's latest round hasn't been sent yet */
    hasNew: quote.data?.[1] ?? false,
    /** next source round Base needs, if it exists on the source and nobody has sent it */
    gap: nextSrc !== undefined && nextSent.data === false ? nextSrc : undefined,
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
