"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthUnauthorizedEvent } from "@/data/api-client";
import { loginHrefForUrl } from "@/data/auth-redirect.mjs";

// AuthRedirectListener mounts a single window-level event handler that
// catches the `auth:unauthorized` CustomEvent emitted by api-client's
// jsonOrThrow on 401 session-failure responses. On trigger:
//   1. Clear the per-browser X-User-Id (it's tied to the logged-in
//      session — keeping it would make /login send a stale header).
//   2. router.replace("/login?next=...") — replace, not push, so the user
//      can re-login and return to the current AI Money context without
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
      router.replace(loginHrefForUrl(window.location.href));
    }

    window.addEventListener(AuthUnauthorizedEvent, onAuthFailure);
    return () => window.removeEventListener(AuthUnauthorizedEvent, onAuthFailure);
  }, [router]);

  return null;
}
