"use client";

import Link from "next/link";
import { Fragment } from "react";

import { ROUTE_LABELS } from "@/data/route-labels";

// Node 2.C.3 — breadcrumb helper.
//
// Given a pathname like "/data-explorer/macro", renders:
//   首页 / 数据浏览 / 宏观
//
// Each non-final segment is a link to its accumulated prefix; the final
// segment is plain text. Segment → label resolution goes through
// ROUTE_LABELS (defined in client/data/route-labels.ts); unknown
// segments (typically dynamic ids like `/accounts/abc123`) render the
// raw segment string. This is intentional — we don't want a server
// round-trip just to translate ids, and showing the id is genuinely
// useful for debugging in the URL bar.
//
// Renders nothing when the path is "/" or empty (no crumbs to show).

export function Breadcrumb({ path }: { path: string }) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // Build progressive prefixes: ["/a", "/a/b", "/a/b/c"].
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = ROUTE_LABELS[href] ?? decodeURIComponent(seg);
    return { href, label, isLast: i === segments.length - 1 };
  });

  return (
    <nav aria-label="面包屑" className="flex items-center text-xs">
      <Link
        href="/dashboard"
        className="text-text-tertiary hover:text-text-secondary"
      >
        首页
      </Link>
      {crumbs.map((c) => (
        <Fragment key={c.href}>
          <span className="mx-1.5 text-text-tertiary" aria-hidden>
            /
          </span>
          {c.isLast ? (
            <span className="text-text-primary font-medium">{c.label}</span>
          ) : (
            <Link
              href={c.href}
              className="text-text-tertiary hover:text-text-secondary"
            >
              {c.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
