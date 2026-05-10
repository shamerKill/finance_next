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
            TRADING HALTED — {state.haltedReason ?? "no reason given"}
            {state.haltedBy ? ` (by ${state.haltedBy})` : ""}
          </span>
          <Link href="/admin" className="underline">
            manage
          </Link>
        </div>
      )}
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-default-200 p-4">
          <div className="text-lg font-semibold mb-6">finance_next</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link className="hover:text-primary" href="/accounts">
              Accounts
            </Link>
            <Link className="hover:text-primary" href="/portfolio">
              Portfolio
            </Link>
            <Link className="hover:text-primary" href="/strategies">
              Strategies
            </Link>
            <Link className="hover:text-primary" href="/api-list">
              Strategies (legacy)
            </Link>
            <Link className="hover:text-primary" href="/option">
              New Strategy
            </Link>
            <Link className="hover:text-primary" href="/markets">
              Markets
            </Link>
            <Link className="hover:text-primary" href="/backtests">
              Backtests
            </Link>
            <Link className="hover:text-primary" href="/recommendations">
              Recommendations
            </Link>
            <Link className="hover:text-primary" href="/data-explorer">
              Data Explorer
            </Link>
            <Link className="hover:text-primary mt-4" href="/wallets">
              Wallets
            </Link>
            <Link className="hover:text-primary" href="/prediction/markets">
              Prediction Markets
            </Link>
            <Link className="hover:text-primary" href="/prediction/strategies">
              Prediction Strategies
            </Link>
            <Link className="hover:text-primary mt-4" href="/admin">
              Admin
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
