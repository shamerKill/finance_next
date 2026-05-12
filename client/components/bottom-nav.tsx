"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

// Node 2.C.3 — mobile bottom nav.
//
// Five primary entries fixed at the bottom of the viewport on `< md`
// breakpoints; hidden on `md+`. Icons are inline SVGs to avoid pulling
// in a new icon library. Active route is matched by isActive() — the
// same prefix-aware rule used by <Sidebar>, so e.g. /data-explorer/macro
// keeps the "数据" tab highlighted.

interface NavEntry {
  href: string;
  label: string;
  // Path prefixes that should also count as active for this entry.
  // Empty array = only exact match (and direct subpaths of href).
  activePrefixes?: string[];
  icon: ReactNode;
}

const HomeIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
  </svg>
);

const StrategiesIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
  </svg>
);

const DataIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
  </svg>
);

const PortfolioIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 12V8H4a2 2 0 0 1 0-4h12v4" />
    <path d="M2 8v12a2 2 0 0 0 2 2h16v-4" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
  </svg>
);

const MoreIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "仪表盘", icon: HomeIcon },
  {
    href: "/strategies",
    label: "策略",
    activePrefixes: [
      "/strategies",
      "/option",
      "/recommendations",
      "/backtests",
    ],
    icon: StrategiesIcon,
  },
  {
    href: "/data-explorer",
    label: "数据",
    activePrefixes: ["/data-explorer", "/markets", "/prediction"],
    icon: DataIcon,
  },
  {
    href: "/portfolio",
    label: "持仓",
    activePrefixes: ["/portfolio", "/accounts", "/wallets"],
    icon: PortfolioIcon,
  },
  { href: "/more", label: "更多", icon: MoreIcon },
];

function isActive(pathname: string, entry: NavEntry): boolean {
  if (entry.href === pathname) return true;
  if (pathname.startsWith(entry.href + "/")) return true;
  for (const p of entry.activePrefixes ?? []) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export function BottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="底部导航"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 h-14 bg-bg-surface/95 border-t border-border-default backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80"
    >
      {ENTRIES.map((entry) => {
        const active = isActive(pathname, entry);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] leading-none ${
              active
                ? "text-accent-info"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {entry.icon}
            <span>{entry.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
