import Link from "next/link";
import { ReactNode } from "react";

import { KillSwitchBanner } from "@/components/kill-switch-banner";

// Dashboard route group layout. Server component — renders the sidebar
// + main slot so children that are async server components (accounts,
// backtests, portfolio, etc.) keep their SSR. The kill-switch banner is
// a small client island mounted at the top of the flex column.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <KillSwitchBanner />
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-default-200 p-4">
          <div className="text-lg font-semibold mb-6">finance_next</div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link className="hover:text-primary" href="/accounts">
              账户
            </Link>
            <Link className="hover:text-primary" href="/portfolio">
              投资组合
            </Link>
            <Link className="hover:text-primary" href="/strategies">
              策略
            </Link>
            <Link className="hover:text-primary" href="/option">
              新建策略
            </Link>
            <Link className="hover:text-primary" href="/markets">
              行情
            </Link>
            <Link className="hover:text-primary" href="/backtests">
              回测
            </Link>
            <Link className="hover:text-primary" href="/recommendations">
              AI 推荐
            </Link>
            <Link className="hover:text-primary" href="/data-explorer">
              数据浏览
            </Link>
            <Link className="hover:text-primary mt-4" href="/wallets">
              钱包
            </Link>
            <Link className="hover:text-primary" href="/prediction/markets">
              预测市场
            </Link>
            <Link className="hover:text-primary" href="/prediction/strategies">
              预测策略
            </Link>
            <Link className="hover:text-primary mt-4" href="/admin">
              管理
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
