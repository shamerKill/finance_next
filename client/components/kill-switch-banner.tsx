"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, TypeSystemState, getSystemState } from "@/data/api-client";
import { shouldShowAdminReloginHint } from "@/data/api-auth-event.mjs";
import { useLoginHref } from "@/data/use-login-href";

// Phase 7 kill-switch banner. Mounted by the server-rendered dashboard
// layout. Polls /api/v1/admin/system-state every 15s. Auth is by JWT
// cookie role=admin — non-admin sessions get a 403 and the banner stays
// silent (this isn't a status indicator for everyone, just the admin
// red-bar). Only a true session failure renders a small re-login hint.
export function KillSwitchBanner() {
  const [state, setState] = useState<TypeSystemState | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const loginHref = useLoginHref();

  useEffect(() => {
    let cancel = false;
    const tick = async () => {
      try {
        const s = await getSystemState();
        if (cancel) return;
        setState(s);
        setUnauthorized(false);
      } catch (e) {
        if (cancel) return;
        if (e instanceof ApiError) {
          setState(null);
          setUnauthorized(shouldShowAdminReloginHint(e.status));
        }
        // Other errors: leave previous state in place; banner does not
        // need to be alarmist about transient failures.
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  if (state?.tradingHalted) {
    return (
      <div className="bg-danger text-white px-4 py-2 text-sm font-semibold flex items-center justify-between">
        <span>
          交易已暂停 — {state.haltedReason ?? "未提供原因"}
          {state.haltedBy ? ` (由 ${state.haltedBy} 操作)` : ""}
        </span>
        <Link href="/settings/system" className="underline">
          系统设置
        </Link>
      </div>
    );
  }

  if (unauthorized && !dismissed) {
    return (
      <div className="bg-warning-50 text-warning-700 border-b border-warning-200 px-4 py-1.5 text-xs flex items-center justify-between gap-3">
        <span>
          管理员状态不可用 ·{" "}
          <Link href={loginHref} className="underline font-medium">
            重新登录 →
          </Link>
        </span>
        <button
          type="button"
          aria-label="忽略此提示"
          onClick={() => setDismissed(true)}
          className="text-warning-700/70 hover:text-warning-700 px-2"
        >
          ×
        </button>
      </div>
    );
  }

  return null;
}
