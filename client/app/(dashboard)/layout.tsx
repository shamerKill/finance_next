import { ReactNode } from "react";

import { KillSwitchBanner } from "@/components/kill-switch-banner";
import { Sidebar } from "@/components/sidebar";

// Dashboard route group layout. The layout itself stays a server
// component so async page children keep their SSR; the sidebar (which
// needs usePathname + polling) is an extracted client island.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <KillSwitchBanner />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
