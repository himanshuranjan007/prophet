import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";
import { NETS } from "./config";

const rpc = (id: number) => NETS.find((n) => n.chain.id === id)!.rpc;

export function getConfig() {
  return createConfig({
    chains: [baseSepolia, arbitrumSepolia, sepolia],
    connectors: [injected()],
    ssr: true,
    transports: {
      [baseSepolia.id]: http(rpc(baseSepolia.id)),
      [arbitrumSepolia.id]: http(rpc(arbitrumSepolia.id)),
      [sepolia.id]: http(rpc(sepolia.id)),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
