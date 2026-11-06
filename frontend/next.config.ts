import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Wallet SDKs only run in the browser. Their Node entries pull optional deps (e.g. @x402/* via
  // @coinbase/cdp-sdk) that we don't install, so keep them out of the server bundle.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk", "@walletconnect/ethereum-provider"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
