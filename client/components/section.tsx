import { ReactNode } from "react";

// "Card section" wrapper — a bordered/rounded box with an optional
// header strip carrying a title and a right-aligned action slot. Used by
// detail pages to group related controls. Server-renderable.
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded border border-default-200 ${className ?? ""}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-default-200">
          <div className="text-sm font-semibold text-default-700">{title}</div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
