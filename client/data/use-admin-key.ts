"use client";

import { useEffect, useState } from "react";

// Single source of truth for the localStorage admin key used by every
// X-Admin-Key request. The key lives on the same `finance_next_admin_key`
// slot the /admin page writes to; consumers re-render automatically when
// another tab updates it (via the `storage` event).
const KEY = "finance_next_admin_key";

export function useAdminKey(): string {
  const [adminKey, setAdminKey] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdminKey(window.localStorage.getItem(KEY) ?? "");
    function onChange(e: StorageEvent) {
      if (e.key === KEY) setAdminKey(e.newValue ?? "");
    }
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);
  return adminKey;
}
