"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { parseAbiItem, type AbiEvent, type Address, type Hex } from "viem";
import { HUB_ADDRESS, HUB_CHAIN, NETS, Outcome, assetByFeed, netBySelector, type Asset, type Market, type Net } from "./config";
import { hubAbi } from "./abi";
import { useMarkets } from "./hooks";
import { logClient, scanLogs, type RawLog } from "./logs";

/* A wallet's whole Prophet footprint, independent of the wallet's current chain (or of any wallet):
   positions + claimable are read from the hub on Base; history and CCIP trips come from event logs on
   all three chains, filtered by the user's address (an indexed topic everywhere). No indexer needed. */

// ---------------------------------------------------------------- types

export type ChainPosition = {
  net: Net;
  yes: bigint;
  no: bigint;
  /** hub says this chain's position was paid out */
  claimed: boolean;
  /** what the hub would pay now (0 if unresolved, claimed or lost) */
  claimable: bigint;
  /** amount actually paid (from Claimed logs) */
  paid: bigint;
  /** a claim sent from this spoke that the hub hasn't processed yet (exact: sent minus processed) */
  claimPending: boolean;
};

export type PositionStatus =
  | "open" // betting open
  | "closed" // closed, waiting for the Chainlink round / resolve
  | "claim" // resolved, something to claim
  | "paying" // claim sent from a spoke, waiting for the hub (or payout in the air)
  | "won" // resolved, all winnings paid
  | "lost"
  | "refunded"; // void market, refunded (or refund claimable -> "claim")

export type PortfolioMarket = {
  id: number;
  market: Market;
  asset?: Asset;
  chains: ChainPosition[]; // only chains with a stake
  staked: bigint;
  yes: bigint;
  no: bigint;
  claimable: bigint;
  paid: bigint;
  status: PositionStatus;
  /** for open markets: what each side would pay this wallet at current pool odds */
  ifYes: bigint;
  ifNo: bigint;
};

export type Trip = {
  kind: "bet" | "claim" | "payout" | "refund";
  net: Net; // the spoke / destination chain
  marketId: number;
  amount?: bigint;
  yes?: boolean;
  messageId: Hex;
  txHash: Hex;
  /** unix seconds of the source tx (undefined if not fetched yet) */
  at?: number;
};

export type HistoryItem = {
  kind: "bet" | "refund" | "claim";
  net: Net; // chain the position belongs to
  marketId: number;
  amount: bigint;
  yes?: boolean;
  /** inbound (bet) or outbound (claim payout / refund) CCIP message; zero for local hub actions */
  messageId?: Hex;
  txHash: Hex;
  blockNumber: bigint;
  at?: number;
};

export type Portfolio = {
  address: Address;
  markets: PortfolioMarket[]; // every market this wallet touched, newest first
  claimable: PortfolioMarket[];
  active: PortfolioMarket[]; // open or closed-unresolved
  settled: PortfolioMarket[];
  inFlight: Trip[];
  history: HistoryItem[];
  totals: {
    atStake: bigint; // in open / unresolved markets (landed)
    inFlight: bigint; // bets still crossing via CCIP
    claimable: bigint;
    returned: bigint; // paid + claimable on resolved markets
    settledStake: bigint; // stake in resolved markets
    pnl: bigint; // returned - settledStake
    wins: number;
    losses: number;
  };
};

// ---------------------------------------------------------------- log scanning

const ZERO_ID = `0x${"0".repeat(64)}` as Hex;
/** Payout / refund legs younger than this are shown as "in the air" (no OffRamp lookup needed). */
const PAYOUT_WINDOW = 45 * 60;
/** Safety net only: a spoke claim still unprocessed after this long is treated as stuck, not in flight. */
const CLAIM_WINDOW = 6 * 3600;

const ev = {
  betPlaced: parseAbiItem(
    "event BetPlaced(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, bool yes, uint256 amount, bytes32 ccipMessageId)",
  ),
  betRefunded: parseAbiItem(
    "event BetRefunded(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, uint256 amount, bytes32 outMessageId)",
  ),
  claimed: parseAbiItem(
    "event Claimed(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector, uint256 amount, bytes32 outMessageId)",
  ),
  betSent: parseAbiItem(
    "event BetSent(bytes32 indexed messageId, uint256 indexed marketId, address indexed user, bool yes, uint256 amount, uint256 fee)",
  ),
  claimSent: parseAbiItem("event ClaimSent(bytes32 indexed messageId, uint256 indexed marketId, address indexed user, uint256 fee)"),
  claimIgnored: parseAbiItem("event ClaimIgnored(uint256 indexed marketId, address indexed user, uint64 indexed chainSelector)"),
};

/** Block timestamps per chain (immutable, cached forever). */
const blockTimes = new Map<string, number>();

const scan = (net: Net, event: AbiEvent, user: Address) => scanLogs(net, event, { user });

async function stamp(net: Net, blocks: bigint[]) {
  const client = logClient(net);
  // newest first: recent events drive the in-flight windows, so they must get times on the first poll
  const todo = [...new Set(blocks)]
    .filter((b) => !blockTimes.has(`${net.chain.id}:${b}`))
    .sort((a, b) => (b > a ? 1 : b < a ? -1 : 0))
    .slice(0, 60);
  await Promise.all(
    todo.map(async (b) => {
      const blk = await client.getBlock({ blockNumber: b });
      blockTimes.set(`${net.chain.id}:${b}`, Number(blk.timestamp));
    }),
  );
}
const timeOf = (net: Net, b: bigint) => blockTimes.get(`${net.chain.id}:${b}`);

type Logs = {
  placed: RawLog[];
  refunded: RawLog[];
  claimed: RawLog[];
  ignored: RawLog[];
  sent: { net: Net; log: RawLog }[];
  claimSent: { net: Net; log: RawLog }[];
};

async function fetchLogs(user: Address): Promise<Logs> {
  const hub = NETS.find((n) => n.isHub)!;
  const spokes = NETS.filter((n) => !n.isHub);
  const [placed, refunded, claimed, ignored, ...spokeLogs] = await Promise.all([
    scan(hub, ev.betPlaced, user),
    scan(hub, ev.betRefunded, user),
    scan(hub, ev.claimed, user),
    scan(hub, ev.claimIgnored, user),
    ...spokes.flatMap((n) => [scan(n, ev.betSent, user), scan(n, ev.claimSent, user)]),
  ]);
  const sent = spokes.flatMap((n, i) => spokeLogs[i * 2].map((log) => ({ net: n, log })));
  const claimSent = spokes.flatMap((n, i) => spokeLogs[i * 2 + 1].map((log) => ({ net: n, log })));

  await Promise.all([
    stamp(hub, [...placed, ...refunded, ...claimed].map((l) => l.blockNumber)),
    ...spokes.map((n) =>
      stamp(n, [...sent, ...claimSent].filter((x) => x.net === n).map((x) => x.log.blockNumber)),
    ),
  ]);
  return { placed, refunded, claimed, ignored, sent, claimSent };
}

// ---------------------------------------------------------------- the hook

/** Everything one wallet has done on Prophet. `address` undefined = nothing to load. */
export function usePortfolio(address: Address | undefined, now: number) {
  const { list: markets, isLoading: marketsLoading } = useMarkets();

  // positions + claimable for every market on every chain, straight from the hub on Base
  const reads = useReadContracts({
    contracts: address
      ? markets.flatMap((m) =>
          NETS.flatMap((n) => [
            { address: HUB_ADDRESS, abi: hubAbi, functionName: "getPosition", args: [BigInt(m.id), address, n.positionSelector], chainId: HUB_CHAIN.id } as const,
            { address: HUB_ADDRESS, abi: hubAbi, functionName: "claimable", args: [BigInt(m.id), address, n.positionSelector], chainId: HUB_CHAIN.id } as const,
          ]),
        )
      : [],
    query: { enabled: !!address && markets.length > 0, refetchInterval: 15_000 },
  });

  const logs = useQuery({
    queryKey: ["portfolioLogs", address?.toLowerCase()],
    enabled: !!address,
    refetchInterval: 20_000,
    queryFn: () => fetchLogs(address!),
  });

  const portfolio = useMemo((): Portfolio | undefined => {
    if (!address) return undefined;
    if (markets.length > 0 && !reads.data) return undefined; // no markets -> an empty portfolio, not a skeleton
    const data = reads.data ?? [];
    const L = logs.data;

    // ---- paid amounts per (market, chain) from Claimed logs
    const paidKey = (m: bigint | number, sel: bigint) => `${m}:${sel}`;
    const paid = new Map<string, bigint>();
    for (const l of L?.claimed ?? []) {
      const k = paidKey(l.args.marketId as bigint, l.args.chainSelector as bigint);
      paid.set(k, (paid.get(k) ?? 0n) + (l.args.amount as bigint));
    }

    // ---- spoke claims still in flight, per (market, chain): the hub emits Claimed or ClaimIgnored for
    // every spoke claim it processes, so pending = sent - processed (exact, no time guessing)
    const ck = (m: bigint | number, sel: bigint) => `${m}:${sel}`;
    const processed = new Map<string, number>();
    for (const l of [...(L?.claimed ?? []), ...(L?.ignored ?? [])]) {
      const k = ck(l.args.marketId as bigint, l.args.chainSelector as bigint);
      processed.set(k, (processed.get(k) ?? 0) + 1);
    }
    const sentClaims = new Map<string, { net: Net; log: RawLog }[]>();
    for (const x of L?.claimSent ?? []) {
      const k = ck(x.log.args.marketId as bigint, x.net.positionSelector);
      sentClaims.set(k, [...(sentClaims.get(k) ?? []), x]);
    }
    /** unprocessed spoke claims for (market, chain), newest first, ignoring stuck ones */
    const pendingClaims = (m: number, n: Net) => {
      const all = (sentClaims.get(ck(m, n.positionSelector)) ?? []).sort((a, b) => (b.log.blockNumber > a.log.blockNumber ? 1 : -1));
      const left = Math.max(0, all.length - (processed.get(ck(m, n.positionSelector)) ?? 0));
      return all.slice(0, left).filter((x) => {
        const at = timeOf(x.net, x.log.blockNumber);
        return now > 0 && at !== undefined && now - at < CLAIM_WINDOW;
      });
    };

    // ---- positions
    const out: PortfolioMarket[] = [];
    markets.forEach((m, mi) => {
      const chains: ChainPosition[] = [];
      NETS.forEach((n, ni) => {
        const base = (mi * NETS.length + ni) * 2;
        const pos = data[base]?.result as { yes: bigint; no: bigint; claimed: boolean } | undefined;
        const claimable = (data[base + 1]?.result as bigint | undefined) ?? 0n;
        if (!pos || pos.yes + pos.no === 0n) return;
        chains.push({
          net: n,
          yes: pos.yes,
          no: pos.no,
          claimed: pos.claimed,
          claimable,
          paid: paid.get(paidKey(m.id, n.positionSelector)) ?? 0n,
          claimPending: !n.isHub && pendingClaims(m.id, n).length > 0,
        });
      });
      if (!chains.length) return;

      const yes = chains.reduce((a, c) => a + c.yes, 0n);
      const no = chains.reduce((a, c) => a + c.no, 0n);
      const claimable = chains.reduce((a, c) => a + c.claimable, 0n);
      const paidSum = chains.reduce((a, c) => a + c.paid, 0n);
      const resolved = m.outcome !== Outcome.Unresolved;
      // a spoke claim for a chain that is still owed something = payout on its way
      const pendingClaim = chains.some((c) => c.claimPending && c.claimable > 0n);

      let status: PositionStatus;
      if (!resolved) status = now > 0 && now < Number(m.closeTime) ? "open" : "closed";
      else if (claimable > 0n) status = pendingClaim ? "paying" : "claim";
      else if (m.outcome === Outcome.Invalid) status = "refunded";
      else if (paidSum > 0n || chains.some((c) => c.claimed && (m.outcome === Outcome.Yes ? c.yes : c.no) > 0n)) status = "won";
      else status = "lost";

      // what each side would pay now (parimutuel, landed pools)
      const total = m.yesPool + m.noPool;
      const ifYes = m.yesPool > 0n ? (yes * total) / m.yesPool : 0n;
      const ifNo = m.noPool > 0n ? (no * total) / m.noPool : 0n;

      out.push({ id: m.id, market: m, asset: assetByFeed(m.feed), chains, staked: yes + no, yes, no, claimable, paid: paidSum, status, ifYes, ifNo });
    });
    out.sort((a, b) => b.id - a.id);

    // ---- CCIP trips
    const landed = new Set((L?.placed ?? []).map((l) => (l.args.ccipMessageId as Hex).toLowerCase()));
    // late bets the hub bounced: match each refund to one sent bet (same market, chain, amount)
    const refundsLeft = [...(L?.refunded ?? [])];
    const inFlight: Trip[] = [];
    for (const { net, log } of L?.sent ?? []) {
      const msg = log.args.messageId as Hex;
      if (landed.has(msg.toLowerCase())) continue;
      const ri = refundsLeft.findIndex(
        (r) =>
          r.args.marketId === log.args.marketId && r.args.chainSelector === net.positionSelector && r.args.amount === log.args.amount,
      );
      if (ri >= 0) {
        refundsLeft.splice(ri, 1);
        continue; // shown in history as a refund
      }
      inFlight.push({
        kind: "bet",
        net,
        marketId: Number(log.args.marketId),
        amount: log.args.amount as bigint,
        yes: log.args.yes as boolean,
        messageId: msg,
        txHash: log.transactionHash,
        at: timeOf(net, log.blockNumber),
      });
    }
    // claims sent from a spoke that the hub hasn't processed yet (exact count, see pendingClaims)
    for (const pm of out) {
      for (const cp of pm.chains) {
        if (!cp.claimPending) continue;
        for (const { net, log } of pendingClaims(pm.id, cp.net)) {
          inFlight.push({ kind: "claim", net, marketId: pm.id, messageId: log.args.messageId as Hex, txHash: log.transactionHash, at: timeOf(net, log.blockNumber) });
        }
      }
    }
    // payouts / refunds flying back to a spoke (recent outbound legs)
    const hub = NETS.find((n) => n.isHub)!;
    for (const [kind, arr] of [["payout", L?.claimed ?? []], ["refund", L?.refunded ?? []]] as const) {
      for (const l of arr) {
        const dest = netBySelector(l.args.chainSelector as bigint);
        const out_ = l.args.outMessageId as Hex;
        const at = timeOf(hub, l.blockNumber);
        if (!dest || dest.isHub || out_ === ZERO_ID || at === undefined || now === 0 || now - at > PAYOUT_WINDOW) continue;
        inFlight.push({ kind, net: dest, marketId: Number(l.args.marketId), amount: l.args.amount as bigint, messageId: out_, txHash: l.transactionHash, at });
      }
    }
    inFlight.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

    // ---- history (hub events: what actually happened to the pool)
    const history: HistoryItem[] = [];
    for (const l of L?.placed ?? []) {
      const net = netBySelector(l.args.chainSelector as bigint);
      if (!net) continue;
      const id = l.args.ccipMessageId as Hex;
      history.push({ kind: "bet", net, marketId: Number(l.args.marketId), amount: l.args.amount as bigint, yes: l.args.yes as boolean, messageId: id === ZERO_ID ? undefined : id, txHash: l.transactionHash, blockNumber: l.blockNumber, at: timeOf(hub, l.blockNumber) });
    }
    for (const [kind, arr] of [["refund", L?.refunded ?? []], ["claim", L?.claimed ?? []]] as const) {
      for (const l of arr) {
        const net = netBySelector(l.args.chainSelector as bigint);
        if (!net) continue;
        const id = l.args.outMessageId as Hex;
        history.push({ kind, net, marketId: Number(l.args.marketId), amount: l.args.amount as bigint, messageId: id === ZERO_ID ? undefined : id, txHash: l.transactionHash, blockNumber: l.blockNumber, at: timeOf(hub, l.blockNumber) });
      }
    }
    history.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));

    // ---- totals
    const active = out.filter((p) => p.status === "open" || p.status === "closed");
    const settled = out.filter((p) => !(p.status === "open" || p.status === "closed"));
    const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
    const returned = sum(settled.map((p) => p.paid + p.claimable));
    const settledStake = sum(settled.map((p) => p.staked));
    return {
      address,
      markets: out,
      claimable: out.filter((p) => p.status === "claim" || p.status === "paying"),
      active,
      settled,
      inFlight,
      history,
      totals: {
        atStake: sum(active.map((p) => p.staked)),
        inFlight: sum(inFlight.filter((t) => t.kind === "bet").map((t) => t.amount ?? 0n)),
        claimable: sum(out.map((p) => p.claimable)),
        returned,
        settledStake,
        pnl: returned - settledStake,
        wins: settled.filter((p) => p.status === "won" || p.status === "claim" || p.status === "paying").filter((p) => p.market.outcome !== Outcome.Invalid).length,
        losses: settled.filter((p) => p.status === "lost").length,
      },
    };
  }, [address, reads.data, logs.data, markets, now]);

  return {
    portfolio,
    /** history marketId -> market, for labels */
    marketById: (id: number) => markets.find((m) => m.id === id),
    loading: marketsLoading || (!!address && markets.length > 0 && !reads.data),
    logsLoading: !!address && logs.isLoading,
    logsError: logs.error as Error | null,
    refetch: async () => {
      await Promise.all([reads.refetch(), logs.refetch()]);
    },
  };
}
