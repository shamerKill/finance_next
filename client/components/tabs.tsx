"use client";

import { Tab, Tabs as HeroTabs } from "@heroui/react";
import { Key, ReactNode } from "react";

// Node 2.C.2 — segmented Tabs.
//
// Thin wrapper around HeroUI's <Tabs> that locks the visual to a
// "segmented control" look (variant=solid, sm radius, no underline).
// Used for strategy-detail sub-pages, settings sections, and chart-shell
// timeframe selectors. Keeping the wrapper means call sites don't all
// need to remember which variant matches the design system.

export interface TabItem {
  key: string;
  label: ReactNode;
  content?: ReactNode;
  isDisabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string) => void;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({
  items,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  size = "md",
  fullWidth = false,
  ariaLabel,
  className,
}: TabsProps) {
  return (
    <HeroTabs
      aria-label={ariaLabel ?? "Tabs"}
      variant="solid"
      radius="sm"
      size={size}
      fullWidth={fullWidth}
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={(k: Key) => onSelectionChange?.(String(k))}
      className={className}
      classNames={{
        // Use surface-2 for the inactive track so the selected tab "pops"
        // in both light and dark themes without re-skinning HeroUI.
        tabList: "bg-bg-surface-2 border border-border-default",
        cursor: "bg-bg-surface shadow-sm",
        tabContent: "text-text-secondary group-data-[selected=true]:text-text-primary",
      }}
    >
      {items.map((item) => (
        <Tab key={item.key} title={item.label} isDisabled={item.isDisabled}>
          {item.content}
        </Tab>
      ))}
    </HeroTabs>
  );
}
