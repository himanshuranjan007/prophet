/* Hand-drawn SVG doodles. All stroke with currentColor so they follow theme tokens. */
type P = { className?: string; style?: React.CSSProperties };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Prophet logo: a crystal ball on a stand, with a sparkle. */
export function CrystalBall({ className, style }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden>
      <path {...stroke} strokeWidth={2.4} d="M24 5.5c9.6-.4 16.9 6.7 16.6 15.6-.3 8.6-7.4 15.3-16.4 15.2C15 36.2 7.6 29.4 7.6 20.7 7.7 12.4 14.6 5.9 24 5.5z" />
      <path {...stroke} strokeWidth={2} d="M14.5 15.5c1.4-3.3 4.4-5.6 8-6.2" opacity={0.7} />
      <path {...stroke} strokeWidth={2.4} d="M13 36.8c-1.5 1.7-2.6 3.6-3 5.6 9.4.9 19.1.8 28.4-.2-.5-2-1.6-3.8-3.2-5.4" />
      <path {...stroke} strokeWidth={2} d="M9.5 42.6c9.8 1.2 19.6 1.1 29.2-.3" />
      <path {...stroke} strokeWidth={2} d="M27.5 17.2l1.3 3.4 3.4 1.1-3.4 1.3-1.2 3.5-1.3-3.5-3.4-1.2 3.4-1.2z" />
    </svg>
  );
}

/** Loose scribbled underline. */
export function Underline({ className, style }: P) {
  return (
    <svg viewBox="0 0 300 20" preserveAspectRatio="none" className={className} style={style} aria-hidden>
      <path
        {...stroke}
        strokeWidth={3.2}
        className="draw-in"
        style={{ ["--len" as string]: 700 }}
        d="M3 13c48-6 101-8 152-7 45 1 89 3 141 7M18 17c55-5 120-6 190-3"
      />
    </svg>
  );
}

/** Hand-drawn circle around something. */
export function Circled({ className, style }: P) {
  return (
    <svg viewBox="0 0 200 80" preserveAspectRatio="none" className={className} style={style} aria-hidden>
      <path
        {...stroke}
        strokeWidth={2.6}
        className="draw-in"
        style={{ ["--len" as string]: 600 }}
        d="M150 9C114-1 46 2 18 18 0 29 3 52 28 63c32 14 104 13 141 0 26-9 33-29 18-42-12-10-36-15-61-16"
      />
    </svg>
  );
}

/** Curvy arrow, pointing right-down by default. */
export function Arrow({ className, style }: P) {
  return (
    <svg viewBox="0 0 120 80" className={className} style={style} aria-hidden>
      <path {...stroke} strokeWidth={2.6} className="draw-in" style={{ ["--len" as string]: 220 }} d="M6 10c22-6 49 2 66 17 12 11 20 26 24 41" />
      <path {...stroke} strokeWidth={2.6} d="M84 58l12 12 9-15" />
    </svg>
  );
}

export function Star({ className, style }: P) {
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} aria-hidden>
      <path {...stroke} strokeWidth={2.2} d="M20 4l3.6 10.6L35 15l-9.2 6.8L29 33l-9-6.6L11 33l3.2-11.2L5 15l11.4-.4z" />
    </svg>
  );
}

export function Sparkle({ className, style }: P) {
  return (
    <svg viewBox="0 0 30 30" className={className} style={style} aria-hidden>
      <path {...stroke} strokeWidth={2.2} d="M15 3v8M15 19v8M3 15h8M19 15h8M7 7l4 4M19 19l4 4M23 7l-4 4M7 23l4-4" />
    </svg>
  );
}

export function Squiggle({ className, style }: P) {
  return (
    <svg viewBox="0 0 120 20" className={className} style={style} aria-hidden>
      <path {...stroke} strokeWidth={2.4} d="M3 12c8-10 15 8 23 0s15-10 23 0 15 8 23 0 15-10 23 0 13 6 20 0" />
    </svg>
  );
}

/** Little chain-hop doodle: two blobs and a dashed bridge, used for CCIP. */
export function Hop({ className, style }: P) {
  return (
    <svg viewBox="0 0 120 40" className={className} style={style} aria-hidden>
      <path {...stroke} strokeWidth={2.2} d="M14 8c7-1 12 5 11 12s-7 12-13 11S2 25 3 18 8 9 14 8z" />
      <path {...stroke} strokeWidth={2.2} d="M106 8c7-1 12 5 11 12s-7 12-13 11-10-6-9-13 5-9 11-10z" />
      <path {...stroke} strokeWidth={2.2} strokeDasharray="4 6" d="M27 18c20-14 46-14 66 0" />
      <path {...stroke} strokeWidth={2.2} d="M86 11l8 7-10 3" />
    </svg>
  );
}
