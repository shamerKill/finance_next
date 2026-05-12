import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { AuthRedirectListener } from "@/components/auth-redirect-listener";
import { KillSwitchBanner } from "@/components/kill-switch-banner";
import { MobileHeader, Sidebar } from "@/components/sidebar";
import { UserMenu } from "@/components/user-menu";
import { getMeServer } from "@/data/auth-server";

// Dashboard route group layout. The layout itself stays a server
// component so async page children keep their SSR; the sidebar (which
// needs usePathname + polling) is an extracted client island.
//
// Phase 1.A.3 hooks:
//   * Server-side `getMeServer()` enforces auth before render — if the
//     cookie is missing or rejected by the gateway, we redirect to
//     /login. This is belt-and-suspenders alongside the edge
//     middleware (which only checks cookie presence).
//   * `<AuthRedirectListener />` handles client-side 401s: a fetch
//     from any page that the gateway rejects (e.g. expired token while
//     the user is mid-session) dispatches `auth:unauthorized` →
//     listener routes back to /login.
//   * `<UserMenu user={me} />` lives in both the desktop sidebar and
//     the mobile header so the user is always one click away from
//     logout / account settings.
//
// <lg viewports: <MobileHeader> renders a sticky top bar with a
// hamburger; the actual nav lives in <Sidebar>'s drawer overlay.
// lg+: <MobileHeader> is hidden via CSS and <Sidebar> renders its
// permanent aside in the flex row alongside <main>.
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await getMeServer();
  if (!me) {
    // Gateway rejected the cookie (expired / forged / blacklisted) or
    // the cookie was never set. Bounce to /login; the middleware would
    // have done the same on the next navigation, but kicking it here
    // saves a flash of broken UI.
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AuthRedirectListener />
      <KillSwitchBanner />
      <div className="lg:hidden flex items-center justify-between border-b border-default-200 bg-white">
        <MobileHeader />
        <div className="px-3">
          <UserMenu user={me} />
        </div>
      </div>
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="hidden lg:flex items-center justify-end gap-3 px-6 py-2 border-b border-default-200">
            <UserMenu user={me} />
          </div>
          <div className="flex-1 p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
