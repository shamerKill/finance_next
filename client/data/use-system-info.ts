"use client";

// Node 3.E.3 — shared hook for the four settings pages that consume
// /api/v1/settings/system-info (admin only). The endpoint is moderately
// expensive (4 sequential dep pings with 2s timeout each in the worst
// case), so we don't poll by default — callers that want a periodic
// refresh (e.g. /settings/observability dep dots) pass `options.poll`
// in ms.

import { useEffect, useState } from "react";

import { getSettingsSystemInfo } from "./api-client";
import type { TypeSettingsSystemInfo } from "./type";

export function useSystemInfo(options?: { poll?: number }) {
  const [data, setData] = useState<TypeSettingsSystemInfo | null>(null);
  const [err, setErr] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      getSettingsSystemInfo()
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setErr(null);
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          setErr(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        });
    };
    fetchOnce();
    if (options?.poll) {
      const id = setInterval(fetchOnce, options.poll);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [options?.poll]);

  return { data, err, loading };
}
