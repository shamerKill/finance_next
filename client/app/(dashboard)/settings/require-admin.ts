// Node 3.E.1 — admin gate for /settings/* admin-only pages.
//
// Server-side helper. Each admin-only page (system, ai, data-sources,
// trading, observability, deployment) calls this at the top of its
// default export; non-admins are redirected to /settings/account before
// any markup is streamed. Centralising the role check + redirect here
// keeps the individual pages one-liner-clean.

import { redirect } from "next/navigation";

import { getMeServer } from "@/data/auth-server";

export async function requireAdmin(): Promise<void> {
  const me = await getMeServer();
  if (me?.role !== "admin") {
    redirect("/settings/account");
  }
}
