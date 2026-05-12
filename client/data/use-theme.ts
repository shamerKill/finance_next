"use client";

import { useCallback, useEffect, useState } from "react";

// Node 2.C.1 — theme hook.
//
// Three-state theme: "light" / "dark" / "system". Persisted to
// localStorage under STORAGE_KEY and reflected on <html data-theme=…>.
//
// On first paint we render with "system" as a stable SSR default; the
// effect below runs once on the client, reads localStorage, and applies
// the user's stored choice. A small inline script in app/layout.tsx
// already set the right data-theme before hydration to prevent flashes,
// so this hook only synchronises React state with the DOM.

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "finance_next_theme";

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage may be disabled (private mode / iframe sandboxing).
    // Fall through to default.
  }
  return "system";
}

export function useTheme() {
  // Start as "system" on both server and client so first render output
  // matches; effect below reconciles with stored value.
  const [theme, setThemeState] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = readStored();
    // The setState below is the *whole point* of this effect — we're
    // hydrating React state from localStorage on mount, which can only
    // happen client-side. The rule is correct in spirit but flagging
    // it here would force a useSyncExternalStore migration for no
    // tangible win (localStorage doesn't fire change events for the
    // same tab anyway).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(stored);
    // Defensive sync — the inline boot script should already have set
    // this attribute, but if a tab is reused across sessions the value
    // may have drifted (e.g. theme cleared from another tab).
    document.documentElement.setAttribute("data-theme", stored);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — UI still updates for the current session
    }
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  return { theme, setTheme };
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
