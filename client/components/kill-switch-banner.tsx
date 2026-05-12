"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, TypeSystemState, getSystemState } from "@/data/api-client";
import { useAdminKey } from "@/data/use-admin-key";

// Phase 7 kill-switch banner. Mounted by the server-rendered dashboard
// layout. Polls /api/v1/admin/system-state every 15s when the user has
// stored an admin key. On a 401/403 we render a small muted "key not
// verified" banner instead of disappearing silently — most users still
// won't be admins (banner stays hidden if no key has ever been set), but
// a key that USED to work and now fails deserves visible feedback.
export function KillSwitchBanner() {
  const adminKey = useAdminKey();
  const [state, setState] = useState<TypeSystemState | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!adminKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(null);
      setUnauthorized(false);
      return;
    }
    let cancel = false;
    const tick = async () => {
      try {
        const s = await getSystemState(adminKey);
        if (cancel) return;
        setState(s);
        setUnauthorized(false);
      } catch (e) {
        if (cancel) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setState(null);
          setUnauthorized(true);
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
  }, [adminKey]);

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
          管理员密钥未验证 ·{" "}
          <Link href="/settings/system" className="underline font-medium">
            前往设置 →
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
