import { ReactNode } from "react";

// Shared page-header primitive. Server-renderable (no "use client") so
// list pages that are async server components can still use it; any
// interactive content (buttons, dropdowns) belongs in `action` which is
// already a ReactNode and can carry its own client boundary.
export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumb,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <div className="text-xs text-default-500 mb-2">{breadcrumb}</div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && (
            <div className="text-sm text-default-500 mt-1">{subtitle}</div>
          )}
        </div>
        {action && (
          <div className="flex items-center gap-2 shrink-0">{action}</div>
        )}
      </div>
    </div>
  );
}
