"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

import { TypeSystemState, getSystemState } from "@/data/api-client";

// Dashboard route group layout. Adds a sidebar with the top-level resource
// links; pages render in the right pane. Phase 7 adds the kill-switch
// banner — when system_state.tradingHalted=true a red strip is rendered
// at the top of every dashboard page.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TypeSystemState | null>(null);

  useEffect(() => {
    // Best-effort poll: only operators with the admin key see the
    // banner. Anonymous users get a 401 here; we just hide.
    const adminKey =
      typeof window !== "undefined"
        ? window.localStorage.getItem("finance_next_admin_key") ?? ""
        : "";
    if (!adminKey) return;
    let cancel = false;
    const tick = async () => {
      try {
        const s = await getSystemState(adminKey);
        if (!cancel) setState(s);
      } catch {
        // ignore — admin key probably wrong / endpoint gated
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {state?.tradingHalted && (
        <div className="bg-danger text-white px-4 py-2 text-sm font-semibold flex items-center justify-between">
          <span>
            交易已暂停 — {state.haltedReason ?? "未提供原因"}
            {state.haltedBy ? ` (由 ${state.haltedBy} 操作)` : ""}
          </span>
          <Link href="/admin" className="underline">
            管理
          </Link>
        </div>
      )}
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-default-200 p-4">
          <div className="text-lg font-semibold mb-6">finance_next</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link className="hover:text-primary" href="/accounts">
              账户
            </Link>
            <Link className="hover:text-primary" href="/portfolio">
              投资组合
            </Link>
            <Link className="hover:text-primary" href="/strategies">
              策略
            </Link>
            <Link className="hover:text-primary" href="/api-list">
              策略（旧版）
            </Link>
            <Link className="hover:text-primary" href="/option">
              新建策略
            </Link>
            <Link className="hover:text-primary" href="/markets">
              行情
            </Link>
            <Link className="hover:text-primary" href="/backtests">
              回测
            </Link>
            <Link className="hover:text-primary" href="/recommendations">
              AI 推荐
            </Link>
            <Link className="hover:text-primary" href="/data-explorer">
              数据浏览
            </Link>
            <Link className="hover:text-primary mt-4" href="/wallets">
              钱包
            </Link>
            <Link className="hover:text-primary" href="/prediction/markets">
              预测市场
            </Link>
            <Link className="hover:text-primary" href="/prediction/strategies">
              预测策略
            </Link>
            <Link className="hover:text-primary mt-4" href="/admin">
              管理
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
