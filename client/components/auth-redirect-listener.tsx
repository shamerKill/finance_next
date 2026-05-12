"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthUnauthorizedEvent } from "@/data/api-client";

// AuthRedirectListener mounts a single window-level event handler that
// catches the `auth:unauthorized` CustomEvent emitted by api-client's
// jsonOrThrow on 401/403 responses. On trigger:
//   1. Clear the per-browser X-User-Id (it's tied to the logged-in
//      session — keeping it would make /login send a stale header).
//   2. router.replace("/login") — replace, not push, so the user can't
//      "back" into a broken authenticated page that would immediately
//      404 again.
//
// Mounted near the top of the dashboard layout so it covers every
// authenticated route. Auth pages don't need this listener — they're
// already on the login flow.
export function AuthRedirectListener() {
  const router = useRouter();

  useEffect(() => {
    function onAuthFailure() {
      try {
        window.localStorage.removeItem("finance_next_user_id");
      } catch {
        /* ignore — localStorage can be disabled */
      }
      router.replace("/login");
    }

    window.addEventListener(AuthUnauthorizedEvent, onAuthFailure);
    return () => window.removeEventListener(AuthUnauthorizedEvent, onAuthFailure);
  }, [router]);

  return null;
}
