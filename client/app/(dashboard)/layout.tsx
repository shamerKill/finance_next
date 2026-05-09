import Link from "next/link";
import { ReactNode } from "react";

// Dashboard route group layout. Adds a sidebar with the top-level resource
// links; pages render in the right pane. Phase 7 will gate access to this
// layout behind authentication.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-default-200 p-4">
        <div className="text-lg font-semibold mb-6">finance_next</div>
        <nav className="flex flex-col gap-2 text-sm">
          <Link className="hover:text-primary" href="/accounts">
            Accounts
          </Link>
          <Link className="hover:text-primary" href="/strategies">
            Strategies
          </Link>
          <Link className="hover:text-primary" href="/api-list">
            Strategies (legacy)
          </Link>
          <Link className="hover:text-primary" href="/option">
            New Strategy
          </Link>
          <Link className="hover:text-primary" href="/markets">
            Markets
          </Link>
          <Link className="hover:text-primary" href="/backtests">
            Backtests
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
