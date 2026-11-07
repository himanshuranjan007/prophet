# Prophet frontend

The Next.js app for Prophet. See the [root README](../README.md) for what Prophet is, the contracts and the Chainlink integration.

```bash
npm install
npm run dev     # http://localhost:3000
```

- **Config:** chains, contract addresses, feeds and RPCs are in [`src/lib/config.ts`](src/lib/config.ts).
- **Design system:** colours, type, the hand-drawn style and theme rules are in [`DESIGN.md`](DESIGN.md).
- **Optional env vars:**
  - `NEXT_PUBLIC_WC_PROJECT_ID` enables WalletConnect.
  - `NEXT_PUBLIC_SITE_URL` sets the canonical URL for share cards; on Vercel it defaults to the production domain.
