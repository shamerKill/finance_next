"use client";

// Client wrapper around the shared <Tabs> primitive so the server-rendered
// detail page can drop its 4 panels (equity / trades / params / meta) into
// a segmented control. The contents themselves are server-composed React
// trees passed through `items[].content`; Next.js serialises them across
// the client boundary like any other prop.

import { ReactNode, useState } from "react";

import { Tabs } from "@/components/tabs";

export interface DetailTabItem {
  key: string;
  label: string;
  content: ReactNode;
}

export function DetailTabs({ items }: { items: DetailTabItem[] }) {
  const [active, setActive] = useState(items[0]?.key ?? "");
  return (
    <Tabs
      ariaLabel="backtest detail tabs"
      items={items}
      selectedKey={active}
      onSelectionChange={setActive}
      size="md"
    />
  );
}
