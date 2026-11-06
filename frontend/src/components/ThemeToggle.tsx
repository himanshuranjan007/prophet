"use client";

import { setTheme, useTheme } from "@/lib/theme";
import { IconMoon, IconSun } from "./Doodles";

/** Header light/dark switch. Shows the theme you'd switch TO (moon in light mode, sun in dark). */
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn-quiet h-9 w-9 justify-center px-0"
      onClick={() => theme && setTheme(next)}
      aria-label={theme ? `Switch to ${next} theme` : "Switch theme"}
      title={theme ? `Switch to ${next} theme` : undefined}
    >
      {/* before hydration the theme is unknown: keep the slot, no icon (avoids a wrong-icon flash) */}
      {theme === "dark" ? <IconSun className="h-5 w-5" /> : theme === "light" ? <IconMoon className="h-5 w-5" /> : null}
    </button>
  );
}
