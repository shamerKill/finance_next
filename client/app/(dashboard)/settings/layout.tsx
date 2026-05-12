// Node 3.E.1 — /settings layout.
//
// Settings is a single tree (per spec §G3) that subsumes the previous
// /admin/* surface alongside a future /settings/account personal panel.
// The layout is a server component because it resolves the current
// user's role via `getMeServer()`. The role is forwarded to the
// SettingsNav client child which filters admin-only entries from the
// visible nav. Server-side gating of admin-only ROUTES is enforced
// page-by-page via `require-admin.ts`, which calls `redirect()` before
// any markup is streamed.

import { ReactNode } from "react";

import { getMeServer } from "@/data/auth-server";

import { SettingsNav, type SettingsRole } from "./settings-nav";

export const metadata = { title: "设置" };

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await getMeServer();
  const role: SettingsRole = me?.role === "admin" ? "admin" : "member";

  return (
    <div className="md:flex md:gap-6">
      <SettingsNav role={role} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
