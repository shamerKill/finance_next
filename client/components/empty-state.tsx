import { ReactNode } from "react";

// EmptyState renders inside list page bodies (and table empty rows) when
// the gateway returned zero results. Server-renderable; the optional
// `action` slot is a ReactNode so callers can drop in a <Link>, a
// HeroUI Button, or anything they need.
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded border border-dashed border-default-200 bg-default-50 py-12 px-6 gap-2">
      {icon && <div className="text-default-400 mb-1">{icon}</div>}
      <div className="text-base font-medium text-default-700">{title}</div>
      {description && (
        <div className="text-sm text-default-500 max-w-md">{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
