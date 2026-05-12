"use client";

import { useEffect, useState } from "react";

// Node 2.C.2 — media query hook.
//
// Tiny wrapper around matchMedia for components that *need* JS-side
// branching (e.g. <DataTable mobileLayout="card"> deciding whether to
// render a table or stacked cards). Prefer CSS media queries whenever
// possible — this hook exists for cases where the JSX tree shape itself
// needs to change.
//
// SSR-safe: returns `false` on the server and during the first paint,
// then re-renders with the real value after the effect runs.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const apply = () => setMatches(mql.matches);
    apply();
    // Safari < 14 only supports addListener / removeListener.
    if (mql.addEventListener) {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
    mql.addListener(apply);
    return () => mql.removeListener(apply);
  }, [query]);

  return matches;
}

// Tailwind `md` breakpoint. Matches `< md` (mobile) when this returns false.
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
