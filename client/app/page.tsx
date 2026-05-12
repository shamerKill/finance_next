import { redirect } from "next/navigation";

import { getMeServer } from "@/data/auth-server";

// Root entry. Phase 1.A.3:
//   * Authenticated → /dashboard (the Wave 2 monitor landing page).
//   * Anonymous     → /login (the middleware would also do this on the
//     next navigation; doing it here saves a redirect hop).
//
// We use the same server-side getMe helper as the dashboard layout so
// the redirect is consistent with what the layout will subsequently
// enforce. The session check is cheap (a single GET to the gateway)
// and runs once per visit because Next caches the response per render
// pass.
export default async function Home() {
  const me = await getMeServer();
  if (!me) {
    redirect("/login");
  }
  redirect("/dashboard");
}
