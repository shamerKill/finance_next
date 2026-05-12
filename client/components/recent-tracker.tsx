"use client";

import { useEffect } from "react";

import { pushRecent, RecentResourceKind } from "@/data/use-recent-resources";

// Node 2.C.4 — RecentTracker.
//
// 极小的 client island，让 server-component 详情页也能把当前资源
// 推到 "最近访问" list。挂到 page.tsx 内：
//
//   <RecentTracker id={id} kind="strategy" label={name} path={`/strategies/${id}`} />
//
// 副作用只在 mount 时跑一次（依赖数组里 4 个 prop 都是 stable string）。

export interface RecentTrackerProps {
  id: string;
  kind: RecentResourceKind;
  label: string;
  path: string;
}

export function RecentTracker({ id, kind, label, path }: RecentTrackerProps) {
  useEffect(() => {
    pushRecent({ id, kind, label, path });
  }, [id, kind, label, path]);
  return null;
}
