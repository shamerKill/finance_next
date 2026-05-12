"use client";

import {
  Drawer as HeroDrawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from "@heroui/react";
import { ReactNode } from "react";

// Node 2.C.2 — Drawer.
//
// Thin wrapper around HeroUI's <Drawer> with sensible defaults:
//   side="right"  → desktop side panel (320–480px wide depending on size)
//   side="bottom" → mobile bottom sheet, takes ~half the viewport
//
// Used for orderbook detail, recommendation diff drilldown, and any
// other "open a panel for context without leaving the page" pattern.
// Backdrop click closes the drawer (HeroUI default).

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "right" | "bottom";
  size?: "sm" | "md" | "lg" | "xl";
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({
  open,
  onOpenChange,
  side = "right",
  size = "md",
  title,
  children,
  footer,
}: DrawerProps) {
  return (
    <HeroDrawer
      isOpen={open}
      onOpenChange={onOpenChange}
      placement={side}
      size={size}
      backdrop="opaque"
    >
      <DrawerContent>
        {() => (
          <>
            {title && (
              <DrawerHeader className="text-text-primary border-b border-border-default">
                {title}
              </DrawerHeader>
            )}
            <DrawerBody className="text-text-primary">{children}</DrawerBody>
            {footer && (
              <DrawerFooter className="border-t border-border-default">
                {footer}
              </DrawerFooter>
            )}
          </>
        )}
      </DrawerContent>
    </HeroDrawer>
  );
}
