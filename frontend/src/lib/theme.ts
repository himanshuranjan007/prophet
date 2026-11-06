"use client";

import { useSyncExternalStore } from "react";

/* Theme override. Default = follow the system. Picking the theme that matches the system clears the
   override (back to following it); picking the other one pins it via <html data-theme="…"> + localStorage.
   The inline script in layout.tsx (THEME_SCRIPT) applies the stored choice before first paint. */

import { THEME_KEY } from "./theme-script";

export type Theme = "light" | "dark";
const EVENT = "prophet:theme";

const mq = () => window.matchMedia("(prefers-color-scheme: dark)");
const systemTheme = (): Theme => (mq().matches ? "dark" : "light");

/** The theme actually showing right now. */
export function resolvedTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" || t === "dark" ? t : systemTheme();
}

export function setTheme(t: Theme) {
  const root = document.documentElement;
  if (t === systemTheme()) {
    delete root.dataset.theme;
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {}
  } else {
    root.dataset.theme = t;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const m = mq();
  m.addEventListener("change", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    m.removeEventListener("change", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** Current theme; null during SSR / before hydration (render a neutral placeholder then). */
export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, resolvedTheme, () => null);
}
