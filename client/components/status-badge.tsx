import { Chip } from "@heroui/react";
import { ReactNode } from "react";

// Maps our project tones to HeroUI Chip colors. "default" is grey, the
// rest are semantic. We intentionally narrow HeroUI's color set so call
// sites don't have to know about the underlying widget.
export type StatusTone = "success" | "danger" | "warning" | "default" | "primary";

const TONE_TO_COLOR: Record<StatusTone, "success" | "danger" | "warning" | "default" | "primary"> = {
  success: "success",
  danger: "danger",
  warning: "warning",
  default: "default",
  primary: "primary",
};

export function StatusBadge({
  tone = "default",
  variant = "flat",
  children,
}: {
  tone?: StatusTone;
  variant?: "solid" | "flat";
  children: ReactNode;
}) {
  return (
    <Chip
      size="sm"
      color={TONE_TO_COLOR[tone]}
      variant={variant}
      radius="sm"
    >
      {children}
    </Chip>
  );
}
