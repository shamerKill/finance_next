"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TypeSystemState, getSystemState } from "@/data/api-client";

// Phase 7 kill-switch banner. Mounted by the server-rendered dashboard
// layout. Only operators with an admin key in localStorage see the
// banner — anonymous users get a 401 from the gateway and the banner
// stays hidden. Polls /api/v1/admin/system-state every 15s.
export function KillSwitchBanner() {
  const [state, setState] = useState<TypeSystemState | null>(null);

  useEffect(() => {
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

  if (!state?.tradingHalted) return null;

  return (
    <div className="bg-danger text-white px-4 py-2 text-sm font-semibold flex items-center justify-between">
      <span>
        交易已暂停 — {state.haltedReason ?? "未提供原因"}
        {state.haltedBy ? ` (由 ${state.haltedBy} 操作)` : ""}
      </span>
      <Link href="/admin" className="underline">
        管理
      </Link>
    </div>
  );
}
