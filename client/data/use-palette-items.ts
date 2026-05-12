"use client";

// Node 2.C.4 — usePaletteItems()
//
// 把 静态 pages + actions + 动态 recent 合成 CommandPalette 的 items 数组。
// 把 router.push 注入到每个 item 的 `action()`。

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  ACTION_ITEMS,
  PAGE_ITEMS,
  StaticPaletteItem,
} from "@/components/command-palette/items";
import type { PaletteItem } from "@/components/command-palette";

import { useRecentResources } from "./use-recent-resources";

const KIND_LABEL: Record<string, string> = {
  strategy: "策略",
  account: "账户",
  wallet: "钱包",
  backtest: "回测",
  market: "行情",
  recommendation: "推荐",
};

function staticToPalette(
  item: StaticPaletteItem,
  push: (path: string) => void,
): PaletteItem {
  return {
    id: item.id,
    label: item.danger ? `⚠ ${item.label}` : item.label,
    search: `${item.label} ${item.searchExtra ?? ""}`,
    group: item.group,
    hint: item.hint,
    action: () => push(item.target),
  };
}

export function usePaletteItems(): PaletteItem[] {
  const router = useRouter();
  const recent = useRecentResources();

  return useMemo(() => {
    const push = (path: string) => router.push(path);

    const recentItems: PaletteItem[] = recent.map((r) => ({
      id: `recent:${r.kind}:${r.id}`,
      label: `${KIND_LABEL[r.kind] ?? r.kind} · ${r.label}`,
      search: `${r.label} ${r.kind} ${r.id}`,
      group: "最近访问",
      hint: r.path,
      action: () => push(r.path),
    }));

    const pageItems = PAGE_ITEMS.map((it) => staticToPalette(it, push));
    const actionItems = ACTION_ITEMS.map((it) => staticToPalette(it, push));

    // 顺序：最近 → 操作 → 导航。CommandPalette 按 group 保留插入顺序。
    return [...recentItems, ...actionItems, ...pageItems];
  }, [router, recent]);
}
