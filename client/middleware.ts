// Next.js root middleware — checks for the `auth_token` cookie on every
// route in the dashboard / app surface and redirects to /login when
// missing. Auth pages (/login, /register, /accept-invite), the Next.js
// asset paths, and the favicon are whitelisted.
//
// IMPORTANT: this is a presence check, NOT a JWT verification. The JWT
// secret lives in the gateway and never reaches the browser; the
// middleware exists purely as a UX optimisation that avoids a flash of
// content before the server-side getMe() inside the dashboard layout
// runs. A forged or expired cookie still passes this check, but the
// gateway's /auth/me will return 401 and the layout listener relocates
// the user back to /login.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/accept-invite",
];

const COOKIE_NAME = "auth_token";

// Node 3.E.1 — legacy /admin/* → /settings/* redirects.
//
// /admin and /admin/ai were retired when the IA collapsed into a single
// /settings tree (spec §G3). /admin/audit is intentionally preserved
// (linked from /settings/observability) and is NOT remapped. The map is
// matched as exact-prefix on `pathname` AFTER the auth gate, so an
// unauth'd user still goes through /login first and lands on the new
// location after sign-in.
const LEGACY_REDIRECTS: Record<string, string> = {
  "/admin": "/settings/system",
  "/admin/ai": "/settings/ai",
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Whitelist the auth pages so unauthenticated users can reach them.
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return NextResponse.next();
    }
  }

  // Cookie present → let the request through; layout's getMe() does the
  // real validity check. Cookie absent → redirect to /login, preserving
  // the intended destination as `?next=` so we can hop back after login
  // (the login page can choose to honour or ignore this).
  const hasCookie = req.cookies.has(COOKIE_NAME);
  if (hasCookie) {
    // Legacy path mapping — runs only for authenticated requests so
    // unauthenticated visitors still see the /login flow first.
    const target = LEGACY_REDIRECTS[pathname];
    if (target) {
      const url = new URL(target, req.url);
      // 308 = Permanent Redirect, preserves method (matters for any old
      // POST form bookmarks pointing at /admin/*).
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

// Matcher: run on everything except Next.js internals and common static
// assets. The PUBLIC_PREFIXES list above is checked inside the function
// because matcher patterns can't express "anywhere except these
// prefixes" cleanly; doing both lets us keep one source of truth for
// the auth whitelist.
export const config = {
  matcher: [
    // FIX-G: `_next/data` is the RSC payload prefetch endpoint Next 15
    // uses for client-side navigation; excluding it prevents the
    // middleware from redirect-looping a logged-out user's prefetch
    // (which would otherwise be served a 307 to /login that the browser
    // can't follow as an RSC payload).
    "/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
