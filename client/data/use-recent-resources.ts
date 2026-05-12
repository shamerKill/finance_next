"use client";

// Node 2.C.4 — 最近访问资源跟踪。
//
// 通过 localStorage 维护用户最近访问的策略 / 账户 / 钱包 / 回测 /
// 行情 / 推荐 详情页，给 CommandPalette 提供 "最近访问" 分组。
//
// 设计要点：
//   - 单一 storage key（`finance_next_recent_resources`），值是数组 JSON。
//   - 保留 最近 5 个，按 lastSeenAt desc。
//   - 写入用 `pushRecent`（可在任意 client 组件 useEffect 里直接调）；
//     不依赖 React 状态。写完后 dispatch 一个 `storage` event-like
//     CustomEvent，让 `useRecentResources` 订阅刷新。
//   - 读取用 `useRecentResources` hook：mount 时初始化 + 监听同窗口
//     `recent-resources:updated` 自定义事件 + 跨标签 `storage` 事件。
//   - SSR 安全：所有 `localStorage` 访问 guard `typeof window`。

import { useEffect, useState } from "react";

export type RecentResourceKind =
  | "strategy"
  | "account"
  | "wallet"
  | "backtest"
  | "market"
  | "recommendation";

export interface RecentResource {
  id: string;
  kind: RecentResourceKind;
  label: string;
  path: string;
  lastSeenAt: number;
}

const STORAGE_KEY = "finance_next_recent_resources";
const MAX_RECENT = 5;
const UPDATE_EVENT = "recent-resources:updated";

function readStorage(): RecentResource[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentResource =>
        r &&
        typeof r === "object" &&
        typeof r.id === "string" &&
        typeof r.kind === "string" &&
        typeof r.label === "string" &&
        typeof r.path === "string" &&
        typeof r.lastSeenAt === "number",
    );
  } catch {
    return [];
  }
}

function writeStorage(items: RecentResource[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  } catch {
    // localStorage 满 / disabled — 静默忽略
  }
}

/**
 * 把一个资源推到 recent list 顶端，去重并截断到 MAX_RECENT。
 *
 * 调用时机：详情页 mount 时（useEffect 里）。
 */
export function pushRecent(resource: Omit<RecentResource, "lastSeenAt">): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const existing = readStorage();
  // 按 kind+id 去重
  const filtered = existing.filter(
    (r) => !(r.kind === resource.kind && r.id === resource.id),
  );
  const next: RecentResource[] = [
    { ...resource, lastSeenAt: now },
    ...filtered,
  ].slice(0, MAX_RECENT);
  writeStorage(next);
}

/**
 * 订阅 recent list。同窗口写入走 CustomEvent；跨标签走 storage event。
 */
export function useRecentResources(): RecentResource[] {
  const [items, setItems] = useState<RecentResource[]>([]);

  useEffect(() => {
    // mount 时同步一次 — 同 CommandPalette 的 SSR→external sync 模式。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(readStorage());

    const onUpdate = () => setItems(readStorage());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(readStorage());
    };
    window.addEventListener(UPDATE_EVENT, onUpdate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UPDATE_EVENT, onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return items;
}
