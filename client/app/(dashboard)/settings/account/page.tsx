// Node 3.E.4 — /settings/account.
//
// Personal account panel: basic info, change password, invite (admin
// only), self-delete (danger zone). Server component fetches the
// current user via getMeServer() and hands off to the client child
// for the interactive parts. When not authenticated we redirect to
// /login — the layout normally does this, but render-time defence
// keeps the dashboard from flashing a logged-out shell.

import { redirect } from "next/navigation";

import { getMeServer } from "@/data/auth-server";

import { AccountClient } from "./account-client";

export default async function SettingsAccountPage() {
  const me = await getMeServer();
  if (!me) {
    redirect("/login");
  }
  return <AccountClient me={me} />;
}
