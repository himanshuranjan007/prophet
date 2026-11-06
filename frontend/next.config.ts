import type { NextConfig } from "next";

// This app lives in frontend/ inside a Foundry repo whose root has its own package-lock.json. Without
// pinning, Next infers the repo root as the workspace (multiple lockfiles), which anchors module
// resolution and Vercel's output file tracing outside the app. Pin both to this folder.
const appRoot = __dirname;

const nextConfig: NextConfig = {
  devIndicators: false,
  // Wallet SDKs only run in the browser. Their Node entries pull optional deps (e.g. @x402/* via
  // @coinbase/cdp-sdk) that we don't install, so keep them out of the server bundle.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk", "@walletconnect/ethereum-provider"],
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
