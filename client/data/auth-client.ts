// Phase 1.A.3 — auth API client.
//
// Thin wrappers over `apiFetch` for the six /auth/* endpoints. All calls
// rely on the shared `credentials: "include"` default so the
// `auth_token` HttpOnly cookie is set / cleared by the gateway and sent
// back on subsequent requests automatically — there is no token to
// store in localStorage. UI components consume these directly; the
// 401/403 → `/login` redirect is handled centrally by the layout
// listening for `auth:unauthorized` events (see api-client.ts).

import { apiFetch } from "./api-client";
import type { TypeInviteResult, TypeUser } from "./type";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const parseUrl = (path: string) => baseUrl + `/${path}`.replace("//", "/");

// Shared error envelope; keeps imports light by not pulling ApiError
// into every caller. We forward the gateway's `{message}` / `{error}`
// payload as the thrown message; consumers only need to read .message
// for inline display.
async function readErr(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return (
        (parsed as { message?: string; error?: string }).message ??
        (parsed as { message?: string; error?: string }).error ??
        text
      );
    }
  } catch {
    /* non-JSON; fall through */
  }
  return text || res.statusText;
}

class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// POST /auth/register — first call creates the bootstrap admin; later
// calls require `inviteToken` (otherwise gateway returns 403). The
// gateway issues a Set-Cookie header on success so the very next
// request is authenticated.
export async function register(input: {
  email: string;
  password: string;
  inviteToken?: string;
}): Promise<TypeUser> {
  const res = await apiFetch(parseUrl("v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new AuthError(res.status, await readErr(res));
  return (await res.json()) as TypeUser;
}

// POST /auth/login — sets the cookie on success. Rate-limited 5/min/IP
// by the gateway, which surfaces as 429.
export async function login(input: {
  email: string;
  password: string;
}): Promise<TypeUser> {
  const res = await apiFetch(parseUrl("v1/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new AuthError(res.status, await readErr(res));
  return (await res.json()) as TypeUser;
}

// POST /auth/logout — gateway clears the cookie (idempotent) and adds
// the current jti to the Redis blacklist when wired. Returns 204.
export async function logout(): Promise<void> {
  const res = await apiFetch(parseUrl("v1/auth/logout"), { method: "POST" });
  if (!res.ok && res.status !== 204) {
    throw new AuthError(res.status, await readErr(res));
  }
}

// GET /auth/me — current user from cookie; 401 = not authenticated.
// We return `null` on 401 so the call site can branch instead of
// catching an error — the most common consumer (UserMenu, page.tsx
// home redirect) wants to ask "am I logged in?".
export async function getMe(): Promise<TypeUser | null> {
  const res = await apiFetch(parseUrl("v1/auth/me"), { cache: "no-store" });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new AuthError(res.status, await readErr(res));
  return (await res.json()) as TypeUser;
}

// POST /auth/invite (admin only) — generates a 24h token + share URL.
// The gateway puts the full URL in the response; we just forward.
export async function invite(input: {
  email: string;
  role?: "admin" | "member";
}): Promise<TypeInviteResult> {
  const res = await apiFetch(parseUrl("v1/auth/invite"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new AuthError(res.status, await readErr(res));
  return (await res.json()) as TypeInviteResult;
}

// POST /auth/accept-invite — completes registration via emailed token.
// The gateway issues a cookie on success and returns the new user.
export async function acceptInvite(input: {
  token: string;
  password: string;
}): Promise<TypeUser> {
  const res = await apiFetch(parseUrl("v1/auth/accept-invite"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new AuthError(res.status, await readErr(res));
  return (await res.json()) as TypeUser;
}

export { AuthError };
