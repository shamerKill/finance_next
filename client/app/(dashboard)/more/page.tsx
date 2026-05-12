"use client";

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SIDEBAR_GROUPS } from "@/components/sidebar";

// Node 2.C.3 — mobile aggregation page.
//
// Reached from the bottom nav "更多" tab on `< md`. Renders every entry
// from the sidebar groups as a tap-friendly card list. Desktop users can
// also navigate here but they have the full sidebar available; the page
// is kept usable at all breakpoints (one column on mobile, two on md+).

export default function MorePage() {
  return (
    <div>
      <PageHeader title="更多" subtitle="所有功能入口" />
      <div className="space-y-6">
        {SIDEBAR_GROUPS.map((group) => (
          <section key={group.label}>
            <h2 className="text-xs uppercase tracking-wide text-text-tertiary mb-2">
              {group.label}
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between rounded-lg border border-border-default bg-bg-surface px-4 py-3 hover:bg-default-100 transition-colors min-h-12"
                  >
                    <span className="text-text-primary">{item.label}</span>
                    <span
                      aria-hidden
                      className="text-text-tertiary text-lg leading-none"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
