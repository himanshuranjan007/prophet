import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";
import { NETS } from "./config";

/** Primary RPC, then the fallback (viem retries the next transport when one errors, e.g. log-range limits). */
const rpc = (id: number) => {
  const n = NETS.find((x) => x.chain.id === id)!;
  return n.rpcFallback ? fallback([http(n.rpc), http(n.rpcFallback)]) : http(n.rpc);
};

export function getConfig() {
  return createConfig({
    chains: [baseSepolia, arbitrumSepolia, sepolia],
    connectors: [injected()],
    ssr: true,
    transports: {
      [baseSepolia.id]: rpc(baseSepolia.id),
      [arbitrumSepolia.id]: rpc(arbitrumSepolia.id),
      [sepolia.id]: rpc(sepolia.id),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
