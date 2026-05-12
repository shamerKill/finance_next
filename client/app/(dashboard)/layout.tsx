import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { AuthRedirectListener } from "@/components/auth-redirect-listener";
import { CommandPaletteMount } from "@/components/command-palette/mount";
import { DashboardShell } from "@/components/dashboard-shell";
import { KillSwitchBanner } from "@/components/kill-switch-banner";
import { getMeServer } from "@/data/auth-server";

// Dashboard route group layout. The layout itself stays a server
// component so async page children keep their SSR; the interactive
// chrome (sidebar, toolbar, mobile header, bottom nav) lives in
// <DashboardShell> as a client component.
//
// Phase 1.A.3 hooks:
//   * Server-side `getMeServer()` enforces auth before render — if the
//     cookie is missing or rejected by the gateway, we redirect to
//     /login. Belt-and-suspenders alongside the edge middleware.
//   * `<AuthRedirectListener />` handles client-side 401s: a fetch from
//     any page that the gateway rejects dispatches `auth:unauthorized`
//     → listener routes back to /login.
//
// Node 2.C.3 layout matrix:
//   * `< md`  : MobileHeader (top) + BottomNav (bottom). Drawer on
//     hamburger tap.
//   * `md ~ lg` : icon-only Sidebar rail (60px) + top toolbar.
//   * `≥ lg`  : full 224px labelled Sidebar + top toolbar.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await getMeServer();
  if (!me) {
    redirect("/login");
  }

  return (
    <>
      <AuthRedirectListener />
      <CommandPaletteMount />
      <KillSwitchBanner />
      <DashboardShell me={me}>{children}</DashboardShell>
    </>
  );
}
