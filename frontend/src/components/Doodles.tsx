/* Prophet's hand-drawn art set. Everything strokes with currentColor (ink),
   round caps/joins, slightly wobbly paths, so art and icons read as one pen. */
type P = { className?: string; style?: React.CSSProperties };

const pen = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ===================================================================== art

/** Prophet logo: a crystal ball on a stand, with a sparkle. */
export function CrystalBall({ className, style }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden>
      <path {...pen} strokeWidth={2.4} d="M24 5.5c9.6-.4 16.9 6.7 16.6 15.6-.3 8.6-7.4 15.3-16.4 15.2C15 36.2 7.6 29.4 7.6 20.7 7.7 12.4 14.6 5.9 24 5.5z" />
      <path {...pen} strokeWidth={2} d="M14.5 15.5c1.4-3.3 4.4-5.6 8-6.2" opacity={0.6} />
      <path {...pen} strokeWidth={2.4} d="M13 36.8c-1.5 1.7-2.6 3.6-3 5.6 9.4.9 19.1.8 28.4-.2-.5-2-1.6-3.8-3.2-5.4" />
      <path {...pen} strokeWidth={2} d="M9.5 42.6c9.8 1.2 19.6 1.1 29.2-.3" />
      <path {...pen} strokeWidth={2} d="M27.5 17.2l1.3 3.4 3.4 1.1-3.4 1.3-1.2 3.5-1.3-3.5-3.4-1.2 3.4-1.2z" />
    </svg>
  );
}

/** Loose scribbled underline; draws itself in once. */
export function Underline({ className, style }: P) {
  return (
    <svg viewBox="0 0 300 20" preserveAspectRatio="none" className={className} style={style} aria-hidden>
      <path
        {...pen}
        strokeWidth={3}
        className="draw-in"
        style={{ ["--len" as string]: 700 }}
        d="M3 13c48-6 101-8 152-7 45 1 89 3 141 7M18 17c55-5 120-6 190-3"
      />
    </svg>
  );
}

/** Four-point sparkle. Use at most once per view. */
export function Sparkle({ className, style }: P) {
  return (
    <svg viewBox="0 0 30 30" className={className} style={style} aria-hidden>
      <path {...pen} strokeWidth={2} d="M15 3c.6 6 2.5 10.4 12 12-9.5 1.6-11.4 6-12 12-.6-6-2.5-10.4-12-12 9.5-1.6 11.4-6 12-12z" />
    </svg>
  );
}

/** Hand-ruled horizontal line (e.g. under the header). */
export function Rule({ className, style }: P) {
  return (
    <svg viewBox="0 0 1000 6" preserveAspectRatio="none" className={className} style={style} aria-hidden>
      <path {...pen} strokeWidth={1.5} vectorEffect="non-scaling-stroke" d="M2 3.4C180 2.2 330 4.4 500 3.1s330-1.4 498 .6" />
    </svg>
  );
}

// ===================================================================== icons (24px grid, 1.8 stroke)

const Icon = ({ className, style, d, sw = 1.8 }: P & { d: string; sw?: number }) => (
  <svg viewBox="0 0 24 24" className={className ?? "h-4 w-4"} style={style} aria-hidden>
    <path {...pen} strokeWidth={sw} d={d} />
  </svg>
);

/** In flight over CCIP. */
export const IconPlane = (p: P) => (
  <Icon {...p} d="M3.2 11.6l17.3-6.9c.5-.2.9.3.7.7l-6.8 15.5c-.2.5-.9.4-1-.1l-1.8-6.3-6.4-1.9c-.5-.1-.5-.8 0-1zM12.6 14.5l8-9.6" />
);
/** Done / landed / paid. */
export const IconCheck = (p: P) => <Icon {...p} d="M4.5 12.8c1.6 1.4 3 2.9 4.4 4.7 2.9-4.6 6.3-8.6 10.6-11.8" sw={2} />;
/** Refunded / bounced back. */
export const IconReturn = (p: P) => (
  <Icon {...p} d="M9.2 6.2L4.6 10.4l4.6 4.3M5 10.5c5.2-.2 9.1-.1 11.6.9 2.8 1.2 3.6 4.4 2.3 6.6-1 1.6-2.7 2.2-4.9 2.2" />
);
/** Time left. */
export const IconClock = (p: P) => (
  <Icon {...p} d="M12 3.6c4.8-.1 8.5 3.7 8.4 8.5-.1 4.6-3.9 8.3-8.5 8.3-4.7-.1-8.4-3.8-8.3-8.5.1-4.5 3.8-8.2 8.4-8.3zM12 7.4v5l3.2 1.9" />
);
/** Create / write. */
export const IconPencil = (p: P) => (
  <Icon {...p} d="M15.6 4.6c1-1 2.6-1 3.6 0 1 1 1 2.6 0 3.6L8.5 18.9 4 20l1.1-4.5L15.6 4.6zM13.8 6.5l3.6 3.6" />
);
/** Opens elsewhere (explorer, X). */
export const IconExternal = (p: P) => (
  <Icon {...p} d="M13.6 4.4h6v6M19.4 4.6l-8.2 8.3M10 5.4H6.2c-.9 0-1.6.7-1.6 1.6v10.8c0 .9.7 1.6 1.6 1.6H17c.9 0 1.6-.7 1.6-1.6V14" />
);
/** Copy link. */
export const IconCopy = (p: P) => (
  <Icon {...p} d="M8.6 8.4h9.2c.9 0 1.6.7 1.6 1.6v9.2c0 .9-.7 1.6-1.6 1.6H8.6c-.9 0-1.6-.7-1.6-1.6V10c0-.9.7-1.6 1.6-1.6zM16.6 5.8c-.1-.8-.8-1.4-1.6-1.4H5.8c-.9 0-1.6.7-1.6 1.6V15c0 .8.6 1.5 1.4 1.6" />
);
/** Back. */
export const IconBack = (p: P) => <Icon {...p} d="M20 12.2c-5.2-.3-10.4-.2-15.4.1M9.8 6.8l-5.4 5.5 5.6 5.3" />;
/** Coins / test tokens. */
export const IconCoins = (p: P) => (
  <Icon {...p} d="M9 4.5c3.3 0 6 1.3 6 2.9s-2.7 2.9-6 2.9-6-1.3-6-2.9 2.7-2.9 6-2.9zM3 7.4v4.3c0 1.6 2.7 2.9 6 2.9M3 11.7V16c0 1.6 2.7 2.9 6 2.9M15 10.8c3.3 0 6 1.3 6 2.9s-2.7 2.9-6 2.9-6-1.3-6-2.9 2.7-2.9 6-2.9zM9 13.7V18c0 1.6 2.7 2.9 6 2.9s6-1.3 6-2.9v-4.3" />
);
/** Warning / heads-up. */
export const IconAlert = (p: P) => (
  <Icon {...p} d="M11.2 4.3c.4-.7 1.3-.7 1.7 0l8 14.1c.4.7-.1 1.5-.9 1.5H4c-.8 0-1.3-.8-.9-1.5l8.1-14.1zM12 9.6v4.4M12 16.9v.1" />
);
/** Wallet (connect). */
export const IconWallet = (p: P) => (
  <Icon {...p} d="M4.4 7.4c0-1.1.9-2 2-2h11.1c.6 0 1 .4 1 1v1.3M4.4 7.4v10.2c0 1 .8 1.8 1.8 1.8h12.6c.6 0 1-.4 1-1v-3.1M4.4 7.4c0 .9.7 1.5 1.6 1.5h12.8c.6 0 1 .4 1 1v2.4M15.6 12.3h4.3v3.1h-4.3c-.9 0-1.6-.7-1.6-1.6s.7-1.5 1.6-1.5z" />
);
/** Close (×). */
export const IconClose = (p: P) => <Icon {...p} d="M6.2 6.4c3.9 3.6 7.6 7.4 11.4 11.3M17.8 6.2c-3.8 3.9-7.6 7.7-11.6 11.5" sw={2} />;
/** Chevron right (row affordance). */
export const IconChevron = (p: P) => <Icon {...p} d="M9.4 5.6c2.3 2.2 4.4 4.4 6.4 6.6-2 2.1-4.1 4.2-6.3 6.3" sw={2} />;
/** QR (scan with phone). */
export const IconQr = (p: P) => (
  <Icon {...p} d="M4.5 4.6h5.4v5.3H4.5zM14.1 4.5h5.4v5.4h-5.4zM4.6 14.1h5.3v5.4H4.6zM14.2 14.2h2.2M18.4 14.1v2.3M14.1 17.4v2.1h2.2M18.5 18.6v.9" />
);
/** Sun (light theme). */
export const IconSun = (p: P) => (
  <Icon {...p} d="M12 7.6c2.5-.1 4.5 1.9 4.4 4.4 0 2.4-2 4.4-4.5 4.3-2.4 0-4.3-2-4.3-4.4.1-2.4 2-4.3 4.4-4.3zM12 2.8v1.9M12 19.3v1.9M2.8 12h1.9M19.3 12h1.9M5.5 5.5l1.3 1.3M17.2 17.2l1.3 1.3M18.5 5.5l-1.3 1.3M6.8 17.2l-1.3 1.3" />
);
/** Moon (dark theme). */
export const IconMoon = (p: P) => (
  <Icon {...p} d="M19.6 14.6c-1 .4-2.1.6-3.3.6-4.6 0-8.2-3.7-8.2-8.2 0-1.2.2-2.3.7-3.3C5.6 5 3.6 8 3.7 11.5c.1 4.8 4 8.7 8.8 8.8 3.4.1 6.4-2 7.1-5.7z" />
);
