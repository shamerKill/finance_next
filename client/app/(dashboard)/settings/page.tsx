import { redirect } from "next/navigation";

// /settings — default landing. Every visible sub-page is reachable from
// the SettingsNav, so the index just bounces to /settings/account which
// is the only entry available to every role.
export default function SettingsIndexPage() {
  redirect("/settings/account");
}
