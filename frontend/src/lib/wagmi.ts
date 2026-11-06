import { createConfig, fallback, http } from "wagmi";
import { baseAccount, injected, walletConnect } from "wagmi/connectors";
import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";
import { NETS } from "./config";

/** Primary RPC, then the fallback (viem retries the next transport when one errors, e.g. log-range limits). */
const rpc = (id: number) => {
  const n = NETS.find((x) => x.chain.id === id)!;
  return n.rpcFallback ? fallback([http(n.rpc), http(n.rpcFallback)]) : http(n.rpc);
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
/** Free project id from https://dashboard.reown.com. WalletConnect (mobile wallets) is hidden without it. */
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
export const walletConnectEnabled = !!WC_PROJECT_ID;

export function getConfig() {
  return createConfig({
    chains: [baseSepolia, arbitrumSepolia, sepolia],
    // Browser wallets announce themselves via EIP-6963 (MetaMask, Rabby, Coinbase extension…) and are
    // added automatically; `injected()` is the fallback for wallets that only set window.ethereum.
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      baseAccount({ appName: "Prophet", appLogoUrl: `${SITE}/icon.svg` }),
      ...(WC_PROJECT_ID
        ? [
            walletConnect({
              projectId: WC_PROJECT_ID,
              showQrModal: false, // the QR is drawn by ConnectModal, in Prophet's style
              metadata: {
                name: "Prophet",
                description: "Cross-chain prediction markets on Chainlink CCIP",
                url: SITE,
                icons: [`${SITE}/icon.svg`],
              },
            }),
          ]
        : []),
    ],
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
