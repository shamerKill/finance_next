import { ReactNode } from "react";

import { KillSwitchBanner } from "@/components/kill-switch-banner";
import { MobileHeader, Sidebar } from "@/components/sidebar";

// Dashboard route group layout. The layout itself stays a server
// component so async page children keep their SSR; the sidebar (which
// needs usePathname + polling) is an extracted client island.
//
// <lg viewports: <MobileHeader> renders a sticky top bar with a
// hamburger; the actual nav lives in <Sidebar>'s drawer overlay.
// lg+: <MobileHeader> is hidden via CSS and <Sidebar> renders its
// permanent aside in the flex row alongside <main>.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <KillSwitchBanner />
      <MobileHeader />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
