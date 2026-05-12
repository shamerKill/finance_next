"use client";

import { ToastProvider as HeroToastProvider } from "@heroui/react";

// Node 2.C.2 — global ToastProvider.
//
// Mounted once at the root layout. HeroUI's <ToastProvider> renders the
// region (portal) where queued toasts surface. Placement and a couple of
// safe defaults are pinned here so individual call sites don't drift.
//
// Placement: bottom-right on desktop, bottom-center on mobile — but
// HeroUI only takes a single placement prop. We pick bottom-right; on
// mobile the toast region naturally narrows to viewport width via the
// internal CSS.

export function ToastProvider() {
  return (
    <HeroToastProvider
      placement="bottom-right"
      maxVisibleToasts={3}
      toastOffset={16}
      toastProps={{
        timeout: 4000,
        shouldShowTimeoutProgress: true,
        radius: "md",
        variant: "flat",
      }}
    />
  );
}
