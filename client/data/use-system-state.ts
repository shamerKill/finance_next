"use client";

import { useEffect, useState } from "react";

import { ApiError, TypeSystemState, getSystemState } from "@/data/api-client";

// Polls /api/v1/admin/system-state every 30s. Auth is by JWT cookie
// role=admin — non-admin sessions get a 403 and the hook returns `null`
// silently. Callers should treat `null` as "unknown" rather than
// "running normally". The Phase 7 kill-switch banner uses the same
// endpoint via its own polling loop; this hook is the sidebar's
// read-only consumer.
export function useSystemState(intervalMs = 30000) {
  const [state, setState] = useState<TypeSystemState | null>(null);

  useEffect(() => {
    let cancel = false;
    const tick = async () => {
      try {
        const s = await getSystemState();
        if (!cancel) setState(s);
      } catch (e) {
        if (cancel) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setState(null);
        }
        // Other errors: keep previous state — the sidebar is not the
        // place to surface transient gateway hiccups.
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}
