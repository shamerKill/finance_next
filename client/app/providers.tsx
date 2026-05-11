"use client";

import { HeroUIProvider } from "@heroui/react";
import { ReactNode } from "react";

// locale="zh-CN" pins the @react-aria i18n bundle to Chinese so default
// aria descriptions (e.g. NumberInput's roledescription "数字字段") render
// correctly. Without an explicit locale, HeroUI defaults to "en-US" and
// browsers that fall back to the system locale can produce mojibake when
// the rendered string is mis-decoded.
export function Providers({ children }: { children: ReactNode }) {
  return <HeroUIProvider locale="zh-CN">{children}</HeroUIProvider>;
}
