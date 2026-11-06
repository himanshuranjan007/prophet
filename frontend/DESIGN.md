# Prophet design system: "ink on paper"

Hand-drawn identity, professional restraint. The art stays: crystal-ball logo,
wobbly pen outlines, highlighter, hatched YES/NO bar, Caveat headlines, pen-drawn
icons. The noise goes: no tilts, no emoji, one accent, one body font.

Source of truth for tokens and utilities: `src/app/globals.css`.
Art and icons: `src/components/Doodles.tsx`.
Shared UI pieces: `src/components/ui.tsx` (`StatusLabel`, `ExternalLink`, `ActionError`). Use them instead of re-styling by hand.

## Typography (2 families)

| Role | Class | Use for |
|---|---|---|
| Hero | `font-display text-hero` | home hero only |
| Title | `font-display text-title` | market question (h1), big page titles |
| Head | `font-display text-head` | section titles ("Live markets") and card titles ("Place a bet") |
| Card question | `font-display text-[1.6rem] leading-tight` | market question inside a list card |
| Body | (default, Nunito) | everything else |
| Label | `eyebrow` | small uppercase label above a value or control |
| Numbers | `num` | every price, amount, %, multiplier, countdown (tabular, no jitter) |
| Addresses / hashes | `font-mono text-[0.8rem]` | only these |

- Caveat is for **words**, never for numbers. A large number (price, payout) is `num text-2xl font-bold` or bigger in Nunito.
- `font-hand`, `sketch-alt` and the `accent` colour aliases have been removed. Don't reintroduce them.
- Weights: 400 body, 600 controls and emphasis, 700/800 key numbers.

## Colour

- `ink` is the only accent: primary buttons (`btn-primary`), links (`link`), focus.
- `yes` / `no` appear **only** on outcome words (YES/NO), the pool bar, the YES/NO toggles and the bet CTA.
- `hl` (highlighter): the hero phrase (`highlight`) and the **currently selected** option (`bg-hl/50`). Nothing else.
- Chain colours: only inside `<ChainDot>`.
- `muted` for secondary text. No other colours (no pink, no blue, no emoji, including in share/post text).
- Errors: `text-sm text-no` (via `<ActionError>`); a wallet rejection shows muted "Cancelled in wallet.".

## Surfaces

- `card`: 1.5px pen outline, no shadow. Default for any panel.
- `card-primary`: 2px outline + 3px offset shadow. **One per view**: the BetPanel, or the ResolveButton when the market is closed.
- Never nest outlined boxes inside a card. Inside a card, separate rows with `rule` (dashed divider) or `divide-y divide-dashed divide-line`.
- `chip`: small outlined pill (e.g. preset amounts, asset tags).
- `skeleton`: dashed pencil placeholder at the real height of what's loading.
- No rotation anywhere (`rotate-*`, `tilt-*`, `-rotate-*`) except the "YES won" stamp.

## Spacing (8px rhythm)

- Page sections: `space-y-12`. Grids: `gap-6`. Card padding: `p-6` (`p-5` on mobile list cards is fine).
- Inside a card: stacks `space-y-4`, label to control `mb-2`.

## Controls

- Buttons: `btn-primary` (ink), `btn-ghost` (card), `btn-yes` / `btn-no` (bet CTA, selected toggle), `btn-quiet` (tertiary text button, no outline).
- The main action of a `card-primary` is full width, `py-3 text-base`. While disconnected it stays visible but disabled, labelled "Connect a wallet to …".
- Step labels while a transaction runs are sentence case ("Confirm in your wallet…", "Sending over CCIP…").
- Segmented control (e.g. chain picker): one `sketch-thin` container, `grid grid-cols-3 divide-x divide-line`, selected segment `bg-hl/50`. Not three separate boxes.
- Inputs: `field`. Put the unit as a suffix inside the field (e.g. "BnM"), presets as `chip`s on their own row.
- External links: `<ExternalLink>` (text + `<IconExternal className="h-3.5 w-3.5" />`), never "↗".
- Status: `<StatusLabel>` (ink `status-dot` + text: "Open", "Awaiting resolution", "YES won"; muted once closed).
- Selectable chips / segments: `aria-pressed`, selected `bg-hl/50`, otherwise `hover:bg-ink/5`.
- Lists inside a card: `mt-2 divide-y divide-dashed divide-line`, rows `py-3`.

## Icons (from Doodles.tsx, 24px pen icons, size with `h-4 w-4`)

`IconPlane` in flight · `IconCheck` done/paid · `IconReturn` refunded · `IconClock` time ·
`IconPencil` create · `IconExternal` explorer/X · `IconCopy` copy · `IconBack` back ·
`IconCoins` test tokens · `IconAlert` warning.

Art: `CrystalBall` (logo, resolve card), `Underline` (hero phrase only), `Sparkle` (max once per view), `Rule` (header/footer).
The old `Star`, `Arrow`, `Squiggle`, `Hop`, `Circled` doodles are retired.

## Motion

- Tokens: `--dur-quick 150ms`, `--dur-base 300ms`, `--dur-slow 600ms`, `--ease-out`, `--ease-ink`. Use them (`duration-(--dur-quick)`), not raw `duration-150`.
- Infinite animation (`wiggle`) only while something is actually busy or in flight.
- Nothing animates on page load except the one hero underline draw-in.
- `prefers-reduced-motion` disables transforms and loops.

### Live price chart (`PriceChart.tsx`)

The data is Chainlink rounds only (no exchange ticks). The motion is time flowing, not invented prices:

- While a market is open, a rAF clock (~30fps, paused in background tabs and under reduced motion) drives the window. `LIVE` (30 min) pins "now" near the right edge, so the chart scrolls. 1H/6H/24H glide.
- The latest price is held as a line out to "now", with a pulsing ink head dot. An ink price tag rides the head in the right gutter (`chart-glide`, `--dur-slow` + `--ease-ink`).
- A new round's step draws in like a pen stroke (`chart-pen`) and a ripple marks it (`chart-ripple`). Both are keyed by round id, so each animates once.
- The y-axis snaps to nice tick steps, so it only rescales on a real breakout, never on every update.
- In LIVE the feed is polled every 5s, otherwise every 15s. Closed markets read a bounded window.
- Labels over the line get a paper halo (`paint-order: stroke`). Strike and zone labels sit on the left, clear of the price tag.

## Copy

- Sentence case, calm, specific. "Place a bet", not "Make your call!!". Keep a little warmth ("Dare a friend" is fine).
- Times: show local time plus relative ("closes 17:50 · in 1h 26m").
