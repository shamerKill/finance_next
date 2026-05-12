import { ReactNode } from "react";

// Shared page-header primitive. Server-renderable (no "use client") so
// list pages that are async server components can still use it; any
// interactive content (buttons, dropdowns) belongs in `action` which is
// already a ReactNode and can carry its own client boundary.
//
// Node 2.C.2 — added `tabs` slot (rendered under title) and sticky-on-
// mobile behavior. On viewports < md the header sticks to the top of the
// viewport with a surface background + border, so the page title stays
// visible while scrolling long lists. Desktop keeps the existing static
// flow.

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumb,
  tabs,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className="mb-6 md:static md:bg-transparent md:border-b-0 sticky top-0 z-10 bg-bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80 border-b border-border-default md:border-transparent -mx-4 px-4 md:mx-0 md:px-0 py-3 md:py-0">
      {breadcrumb && (
        <div className="text-xs text-text-tertiary mb-2">{breadcrumb}</div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary truncate">
            {title}
          </h1>
          {subtitle && (
            <div className="text-sm text-text-secondary mt-1">{subtitle}</div>
          )}
        </div>
        {action && (
          <div className="flex items-center gap-2 shrink-0">{action}</div>
        )}
      </div>
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  );
}
