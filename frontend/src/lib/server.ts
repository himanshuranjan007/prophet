import "server-only";
import { cacheLife } from "next/cache";
import { createPublicClient, http } from "viem";
import { HUB_ADDRESS, HUB_CHAIN, NETS, type Market } from "./config";
import { hubAbi } from "./abi";

const client = createPublicClient({ chain: HUB_CHAIN, transport: http(NETS[0].rpc) });

/** Server-side read for share metadata + OG images. Cached briefly: previews needn't be real-time. */
export async function getMarket(id: string): Promise<Market | null> {
  "use cache";
  cacheLife("minutes");
  try {
    return (await client.readContract({
      address: HUB_ADDRESS,
      abi: hubAbi,
      functionName: "getMarket",
      args: [BigInt(id)],
    })) as Market;
  } catch {
    return null;
  }
}
