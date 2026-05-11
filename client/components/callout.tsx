import { ReactNode } from "react";

export type CalloutVariant = "info" | "warning" | "danger";

const VARIANT_STYLES: Record<CalloutVariant, string> = {
  info: "border-primary-200 bg-primary-50 text-primary-700",
  warning: "border-warning-200 bg-warning-50 text-warning-700",
  danger: "border-danger-200 bg-danger-50 text-danger-700",
};

const DEFAULT_ICON: Record<CalloutVariant, string> = {
  info: "ℹ",
  warning: "⚠",
  danger: "⛔",
};

// Inline callout block — used for the wallet danger explainer, the
// prediction-strategy mainnet banner, and other "read this before you
// proceed" patterns. Server-renderable.
export function Callout({
  variant = "info",
  title,
  children,
  icon,
}: {
  variant?: CalloutVariant;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`rounded border ${VARIANT_STYLES[variant]} p-3 text-sm flex gap-3`}
      role={variant === "danger" ? "alert" : undefined}
    >
      <div className="shrink-0 leading-none text-base">
        {icon ?? DEFAULT_ICON[variant]}
      </div>
      <div className="flex-1 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
