import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";
import { type Address } from "viem";

/** Live deployment (see ../deployments.json at repo root). */
export const HUB_CHAIN = baseSepolia;
export const HUB_ADDRESS: Address = "0xA278b4Df096E8596c9f23c86540ef489678bae7b";
export const HUB_DEPLOY_BLOCK = 55174485n;
export const ETH_USD_FEED: Address = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";
export const FEED_DECIMALS = 8;
export const MIN_BET = 10n ** 15n;

export type AppChain = typeof baseSepolia | typeof arbitrumSepolia | typeof sepolia;

export type Net = {
  chain: AppChain;
  name: string;
  short: string;
  /** CCIP chain selector; 0n for the hub (positions placed locally). */
  positionSelector: bigint;
  ccipSelector: bigint;
  /** Contract users talk to on this chain: the hub on Base, the spoke elsewhere. */
  entry: Address;
  bnm: Address;
  isHub: boolean;
  color: string;
  /** Rough CCIP source-finality wait, shown to users. */
  eta: string;
  rpc: string;
};

export const NETS: Net[] = [
  {
    chain: baseSepolia,
    name: "Base Sepolia",
    short: "Base",
    positionSelector: 0n,
    ccipSelector: 10344971235874465080n,
    entry: HUB_ADDRESS,
    bnm: "0x88A2d74F47a237a62e7A51cdDa67270CE381555e",
    isHub: true,
    color: "#3b82f6",
    eta: "instant",
    rpc: "https://base-sepolia-rpc.publicnode.com",
  },
  {
    chain: arbitrumSepolia,
    name: "Arbitrum Sepolia",
    short: "Arbitrum",
    positionSelector: 3478487238524512106n,
    ccipSelector: 3478487238524512106n,
    entry: "0xA278b4Df096E8596c9f23c86540ef489678bae7b",
    bnm: "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D",
    isHub: false,
    color: "#14b8a6",
    eta: "~25 min",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
  },
  {
    chain: sepolia,
    name: "Ethereum Sepolia",
    short: "Ethereum",
    positionSelector: 16015286601757825753n,
    ccipSelector: 16015286601757825753n,
    entry: "0xA278b4Df096E8596c9f23c86540ef489678bae7b",
    bnm: "0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05",
    isHub: false,
    color: "#a78bfa",
    eta: "~20 min",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  },
];

// ===================================================================== assets

export type AssetSymbol = "ETH" | "BTC" | "SOL";

export type Asset = {
  symbol: AssetSymbol;
  name: string;
  /** Feed the hub settles markets on (always on Base Sepolia). */
  feed: Address;
  /** The real Chainlink Data Feed: charts and live prices read from here. */
  source: { chainId: AppChain["id"]; feed: Address };
  /** Set when `feed` is a RelayedFeed mirror fed over CCIP from `source`. */
  relay?: { relayer: Address; lag: string };
  /** Rounding for the default strike in the create form. */
  strikeStep: number;
  /** Feed's update rule, shown under charts. */
  cadence: string;
  /** Feed heartbeat (s): a new round is published at least this often. */
  heartbeat: number;
};

export const ASSETS: Asset[] = [
  {
    symbol: "ETH",
    name: "Ether",
    feed: ETH_USD_FEED,
    source: { chainId: baseSepolia.id, feed: ETH_USD_FEED },
    strikeStep: 10,
    cadence: "updates on 0.15% moves or every 20 min",
    heartbeat: 1200,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    feed: "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298",
    source: { chainId: baseSepolia.id, feed: "0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298" },
    strikeStep: 100,
    cadence: "updates on 0.1% moves or every 20 min",
    heartbeat: 1200,
  },
  {
    symbol: "SOL",
    name: "Solana",
    // RelayedFeed on Base, fed by FeedRelayer on Arbitrum Sepolia over CCIP
    feed: "0x61053fdf7ab0f5681060309ED5a8dA7A24616A9A",
    source: { chainId: arbitrumSepolia.id, feed: "0x32377717BC9F9bA8Db45A244bCE77e7c0Cc5A775" },
    relay: { relayer: "0x7d043Ca653CC66bB472f4F5FE84E91E69C90Ed8F", lag: "~25 min" },
    strikeStep: 0.5,
    cadence: "updates on 0.5% moves or every 24 h",
    heartbeat: 86400,
  },
];

export const assetBySymbol = (s: AssetSymbol) => ASSETS.find((a) => a.symbol === s)!;
/** Asset for a market's feed; unknown feeds fall back to a generic label. */
export const assetByFeed = (feed: Address): Asset | undefined =>
  ASSETS.find((a) => a.feed.toLowerCase() === feed.toLowerCase());

export const netByChainId = (id?: number) => NETS.find((n) => n.chain.id === id);
export const netBySelector = (sel: bigint) => NETS.find((n) => n.positionSelector === sel);

export const ccipExplorerTx = (hash: string) => `https://ccip.chain.link/tx/${hash}`;
export const ccipExplorerMsg = (id: string) => `https://ccip.chain.link/msg/${id}`;
export const txUrl = (net: Net, hash: string) => `${net.chain.blockExplorers?.default.url}/tx/${hash}`;

export enum Outcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
  Invalid = 3,
}

export type Market = {
  question: string;
  feed: Address;
  strike: bigint;
  closeTime: bigint;
  yesPool: bigint;
  noPool: bigint;
  outcome: number;
  finalPrice: bigint;
};
