"use client";

// Node 3.E.1 — SettingsNav.
//
// Client component because we need `usePathname()` to compute the active
// segment. Renders:
//   - desktop (md+): a vertical rail on the left
//   - mobile (< md): a horizontal scrollable tab strip across the top
//
// Admin-only items are filtered out for non-admin roles up front (the
// layout already redirects admin-only ROUTES to /settings/account
// server-side; this just keeps non-admins from seeing dead links).

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsRole = "admin" | "member";

export type SettingsItem = {
  href: string;
  label: string;
  adminOnly: boolean;
};

// Single source of truth for the settings nav. The layout reads this to
// pass it down (so a future role/route gate could share the list).
export const SETTINGS_ITEMS: SettingsItem[] = [
  { href: "/settings/account", label: "个人", adminOnly: false },
  { href: "/settings/system", label: "系统", adminOnly: true },
  { href: "/settings/ai", label: "AI", adminOnly: true },
  { href: "/settings/data-sources", label: "数据源", adminOnly: true },
  { href: "/settings/trading", label: "交易", adminOnly: true },
  { href: "/settings/observability", label: "监控", adminOnly: true },
  { href: "/settings/deployment", label: "部署", adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function SettingsNav({ role }: { role: SettingsRole }) {
  const pathname = usePathname() ?? "";
  const visible = SETTINGS_ITEMS.filter(
    (it) => role === "admin" || !it.adminOnly,
  );

  return (
    <>
      {/* Mobile: horizontal tab strip */}
      <nav
        className="md:hidden -mx-4 px-4 mb-4 flex gap-1 overflow-x-auto border-b border-border-default"
        aria-label="设置导航"
      >
        {visible.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: vertical rail */}
      <aside
        className="hidden md:flex flex-col gap-1 w-44 shrink-0 text-sm"
        aria-label="设置导航"
      >
        {visible.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`rounded px-3 py-2 ${
                active
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "hover:bg-default-100"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </aside>
    </>
  );
}
