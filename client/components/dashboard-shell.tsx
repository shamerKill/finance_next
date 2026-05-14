"use client";

import { Kbd } from "@heroui/react";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { ActivityCenter } from "@/components/activity-center";
import { BottomNav } from "@/components/bottom-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { MobileHeader, Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { TypeUser } from "@/data/type";
import { ActivityCenterProvider } from "@/data/use-activity-center";
import { useMediaQuery } from "@/data/use-media-query";
import { routeLabel } from "@/data/route-labels";

// Node 2.C.3 — client shell that owns the dashboard chrome (sidebar,
// toolbar, mobile header, bottom nav). The parent dashboard layout
// remains a server component so async children keep their SSR; this
// shell is purely interactive scaffolding.
//
// Responsive matrix (Tailwind defaults):
//   * `< md`  (375 / mobile): <MobileHeader> on top + <BottomNav> on
//     bottom. Hamburger inside MobileHeader opens the Sidebar drawer.
//   * `md ~ lg` (768 / tablet): icon-only Sidebar rail (60px) + top
//     toolbar with breadcrumb + cmd-k + theme + user menu.
//   * `≥ lg`  (1024+): full 224px labelled Sidebar + same toolbar.

interface DashboardShellProps {
  me: TypeUser;
  children: ReactNode;
}

export function DashboardShell({ me, children }: DashboardShellProps) {
  const pathname = usePathname() ?? "/";

  // Tablet detection: width is `md` to just-below `lg`. Sidebar renders
  // as an icon rail in that window. SSR returns `false` for both — we
  // fall back to the desktop labelled aside, which is harmless because
  // the matching `hidden lg:block` / `hidden md:flex lg:hidden` Tailwind
  // classes do the right thing anyway. The hook just guarantees the
  // hook-driven `collapsed` flag flips back when JS hydrates.
  const isTablet = useMediaQuery(
    "(min-width: 768px) and (max-width: 1023.98px)",
  );

  // pageTitle = last route segment's translated label.
  const segments = pathname.split("/").filter(Boolean);
  const last = "/" + segments.join("/");
  const pageTitle = segments.length === 0 ? "首页" : routeLabel(last);

  // Hydration-safe mount flag so we don't render two sidebars in one
  // pass during the first render (server has `isTablet === false`, but
  // we also render the collapsed aside conditionally). Tailwind classes
  // already gate visibility so this is belt-and-suspenders; keeping the
  // mount flag also lets us avoid running matchMedia work pre-hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Hydration flag — exempt from the lint rule (same as CommandPalette
    // setting `query`/`activeIndex` on open). Flips once after mount so
    // we can swap sidebar variant without SSR/CSR markup mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Pick which sidebar variant to render. Pre-hydration we render the
  // full labelled aside (works for `lg+` via Tailwind; tablets see it
  // briefly until hydration swaps). Post-hydration we honour matchMedia.
  const sidebarCollapsed = mounted && isTablet;

  const openCommandPalette = () => {
    window.dispatchEvent(new Event("commandpalette:open"));
  };

  // Cross-platform cmd modifier label. Falls back to "Ctrl" on
  // anything-not-Mac; SSR can't sniff — default to "⌘" and let the
  // client effect swap after hydration. Same trick used elsewhere.
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      // OS detection — sync external (UA) into React state once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    }
  }, []);

  return (
    <ActivityCenterProvider>
    <div className="flex min-h-screen flex-col">
      {/* Mobile (< md): top hamburger header with a compact UserMenu in
          the trailing slot so logout / theme are still reachable
          without scrolling to /more. Main navigation lives in the
          drawer (hamburger) + bottom nav. */}
      <MobileHeader trailing={<UserMenu user={me} />} />

      <div className="flex flex-1">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Top toolbar — visible md+ only. Breadcrumb on the left,
              cmd-k / theme / user-menu on the right. Sticky so it stays
              put while the page scrolls. */}
          <div className="hidden md:flex items-center justify-between gap-3 px-6 py-2 border-b border-border-default bg-bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80 sticky top-0 z-20">
            <div className="min-w-0 flex flex-col gap-0.5">
              <Breadcrumb path={pathname} />
              <h1 className="text-sm font-medium text-text-primary truncate">
                {pageTitle}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openCommandPalette}
                aria-label="搜索 / 操作"
                className="hidden md:inline-flex items-center gap-2 rounded border border-border-default bg-bg-surface px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-default-100"
              >
                <span className="text-text-tertiary">⌕</span>
                <span>搜索 / 操作</span>
                <Kbd keys={isMac ? ["command"] : []}>
                  {isMac ? "K" : "Ctrl K"}
                </Kbd>
              </button>
              <ThemeToggle />
              <UserMenu user={me} />
            </div>
          </div>
          <div className="flex-1 p-4 lg:p-6 pb-20 md:pb-6">{children}</div>
        </main>
      </div>

      <BottomNav />
      <ActivityCenter />
    </div>
    </ActivityCenterProvider>
  );
}
