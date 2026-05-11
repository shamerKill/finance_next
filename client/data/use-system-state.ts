"use client";

import { useEffect, useState } from "react";

import { ApiError, TypeSystemState, getSystemState } from "@/data/api-client";

// Polls /api/v1/admin/system-state every 30s when an admin key is set.
// Returns `null` if no key / 401 / endpoint unavailable — callers should
// treat `null` as "unknown" rather than "running normally". The Phase 7
// kill-switch banner uses the same /admin/system-state endpoint via its
// own polling loop; this hook is the sidebar's read-only consumer.
export function useSystemState(adminKey: string, intervalMs = 30000) {
  const [state, setState] = useState<TypeSystemState | null>(null);

  useEffect(() => {
    if (!adminKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(null);
      return;
    }
    let cancel = false;
    const tick = async () => {
      try {
        const s = await getSystemState(adminKey);
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
  }, [adminKey, intervalMs]);

  return state;
}
