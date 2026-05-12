"use client";

// HeroUI's <Chip> internally calls React.createContext, which is illegal
// in a server component. The wrapper itself doesn't render any state, but
// it MUST cross the client boundary so the Chip's context plumbing runs
// in the browser. Server components import this just like any other
// client component — Next.js inserts the boundary automatically.

import { Chip } from "@heroui/react";
import { ReactNode } from "react";

// Maps our project tones to HeroUI Chip colors. "default" is grey, the
// rest are semantic. We intentionally narrow HeroUI's color set so call
// sites don't have to know about the underlying widget.
export type StatusTone =
  | "success"
  | "danger"
  | "warning"
  | "default"
  | "primary";

const TONE_TO_COLOR: Record<
  StatusTone,
  "success" | "danger" | "warning" | "default" | "primary"
> = {
  success: "success",
  danger: "danger",
  warning: "warning",
  default: "default",
  primary: "primary",
};

// Map tones to our trading-platform accent classes for the dot variant
// (HeroUI Chip's color slot wins for `solid`/`flat`, but the dot variant
// renders our own bullet, so we need the colors here directly).
const TONE_TO_DOT_COLOR: Record<StatusTone, string> = {
  success: "bg-accent-up",
  danger: "bg-accent-down",
  warning: "bg-accent-warning",
  default: "bg-text-tertiary",
  primary: "bg-brand-primary",
};

type ChipSize = "sm" | "md" | "lg";
const SIZE_TO_DOT: Record<ChipSize, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};
const SIZE_TO_TEXT: Record<ChipSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function StatusBadge({
  tone = "default",
  variant = "flat",
  size = "md",
  children,
}: {
  tone?: StatusTone;
  /** "solid" / "flat" use HeroUI's Chip; "dot" renders a plain bullet +
   * label with no background — useful inline in table cells. */
  variant?: "solid" | "flat" | "dot";
  size?: ChipSize;
  children: ReactNode;
}) {
  if (variant === "dot") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-text-secondary ${SIZE_TO_TEXT[size]}`}
      >
        <span
          aria-hidden
          className={`rounded-full ${SIZE_TO_DOT[size]} ${TONE_TO_DOT_COLOR[tone]}`}
        />
        <span>{children}</span>
      </span>
    );
  }
  return (
    <Chip
      size={size}
      color={TONE_TO_COLOR[tone]}
      variant={variant}
      radius="sm"
    >
      {children}
    </Chip>
  );
}
