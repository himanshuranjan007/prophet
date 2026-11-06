import { createPublicClient, http, type AbiEvent, type Address, type Hex, type PublicClient } from "viem";
import type { Net } from "./config";

/* Event-log scanning on the full-range log RPCs (Net.logsRpc), separate from wagmi's read transports:
   sepolia.base.org answers eth_getLogs over wide ranges with HTTP 413. */

const SPAN = 45_000n; // < publicnode's 50k block cap

const clients = new Map<number, PublicClient>();
export function logClient(net: Net): PublicClient {
  let c = clients.get(net.chain.id);
  if (!c) {
    c = createPublicClient({ chain: net.chain, transport: http(net.logsRpc) }) as PublicClient;
    clients.set(net.chain.id, c);
  }
  return c;
}

export type RawLog = { args: Record<string, unknown>; transactionHash: Hex; blockNumber: bigint };

/** Incremental cursor per (chain, contract, event, filter): after the first scan, each poll reads only new blocks. */
const scans = new Map<string, { to: bigint; logs: RawLog[] }>();

/** Every `event` emitted by `address` (default: the chain's Prophet contract) matching the indexed `args`,
 *  oldest first, from the deploy block up to one block behind the head. */
export async function scanLogs(
  net: Net,
  event: AbiEvent,
  args: Record<string, unknown>,
  address: Address = net.entry,
): Promise<RawLog[]> {
  const client = logClient(net);
  const filter = Object.entries(args)
    .map(([k, v]) => `${k}=${String(v).toLowerCase()}`)
    .join(",");
  const key = `${net.chain.id}:${address.toLowerCase()}:${event.name}:${filter}`;
  const prev = scans.get(key) ?? { to: net.deployBlock - 1n, logs: [] };
  const head = (await client.getBlockNumber()) - 1n; // one behind: some RPCs reject the very head
  const logs = [...prev.logs];
  for (let from = prev.to + 1n; from <= head; from += SPAN) {
    const to = from + SPAN - 1n > head ? head : from + SPAN - 1n;
    const got = await client.getLogs({ address, event, args, fromBlock: from, toBlock: to });
    for (const l of got) logs.push({ args: l.args as Record<string, unknown>, transactionHash: l.transactionHash!, blockNumber: l.blockNumber! });
  }
  scans.set(key, { to: head > prev.to ? head : prev.to, logs });
  return logs;
}
