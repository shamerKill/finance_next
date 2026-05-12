// Server-side helpers for the auth flow. Separated from auth-client.ts
// because importing `next/headers` from a module that's also pulled in
// by client components breaks the App-Router boundary check.
//
// Use cases today:
//   * (dashboard)/layout.tsx — fetch the current user for the UserMenu
//   * app/page.tsx — decide whether to redirect to /dashboard or /login
//
// The gateway runs on a separate origin (:3001 in dev), so Node's fetch
// inside a server component does NOT automatically forward the incoming
// request's cookies. We read the auth cookie via next/headers and
// attach it manually as a `Cookie` request header.

import { cookies } from "next/headers";

import type { TypeUser } from "./type";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

const COOKIE_NAME = "auth_token";

// getMeServer fetches the current user on the server. Returns null when
// the cookie is absent or the gateway rejects it (401/403). Any other
// error (network, 5xx) also returns null — server components should
// treat "no user" as "redirect to /login" rather than crashing the
// render.
export async function getMeServer(): Promise<TypeUser | null> {
  let token = "";
  try {
    // next/headers cookies() is async in Next 15+ App Router.
    const c = await cookies();
    token = c.get(COOKIE_NAME)?.value ?? "";
  } catch {
    return null;
  }
  if (!token) return null;

  try {
    const res = await fetch(`${baseUrl}/v1/auth/me`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Cookie: `${COOKIE_NAME}=${token}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as TypeUser;
  } catch {
    return null;
  }
}
