"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

import { listRecommendations } from "@/data/api-client";
import { useAdminKey } from "@/data/use-admin-key";
import { useSystemState } from "@/data/use-system-state";

interface NavItem {
  href: string;
  label: string;
  // Optional slot rendered after the label — used for badges / dots.
  trailing?: (ctx: SidebarContext) => ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarContext {
  pendingRecommendations: number;
  tradingHalted: boolean;
}

const GROUPS: NavGroup[] = [
  {
    label: "运营",
    items: [
      { href: "/dashboard", label: "仪表盘" },
      { href: "/accounts", label: "账户" },
      { href: "/wallets", label: "钱包" },
      { href: "/portfolio", label: "投资组合" },
    ],
  },
  {
    label: "策略",
    items: [
      { href: "/strategies", label: "策略" },
      // /option keeps its URL for now (Phase A note); only the label is
      // updated to "新建策略" so links don't break.
      { href: "/option", label: "新建策略" },
      {
        href: "/recommendations",
        label: "AI 推荐",
        trailing: ({ pendingRecommendations }) =>
          pendingRecommendations > 0 ? (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
              {pendingRecommendations}
            </span>
          ) : null,
      },
      { href: "/backtests", label: "回测" },
    ],
  },
  {
    label: "数据",
    items: [
      { href: "/markets", label: "行情" },
      { href: "/data-explorer", label: "数据浏览" },
      { href: "/prediction/markets", label: "预测市场" },
      { href: "/prediction/strategies", label: "预测策略" },
    ],
  },
  {
    label: "管理",
    items: [
      {
        href: "/admin",
        label: "管理",
        trailing: ({ tradingHalted }) =>
          tradingHalted ? (
            <span
              aria-label="交易已暂停"
              title="交易已暂停"
              className="inline-block h-2 w-2 rounded-full bg-danger"
            />
          ) : null,
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  // Treat subpaths as active too, so e.g. /backtests/abc highlights the
  // /backtests entry. Guard against /a matching /abc by requiring "/".
  return pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const adminKey = useAdminKey();
  const systemState = useSystemState(adminKey);
  const [pending, setPending] = useState(0);

  // Pending-recommendations badge. The endpoint doesn't yet support a
  // `countOnly` flag, so we fetch up to 200 rows and use the length.
  // Fail silently — the sidebar must never break on a transient gateway
  // error. Poll every 30s.
  useEffect(() => {
    let cancel = false;
    const tick = async () => {
      try {
        const rows = await listRecommendations("pending_review");
        if (!cancel) setPending(rows.length);
      } catch {
        // silent
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  const ctx: SidebarContext = {
    pendingRecommendations: pending,
    tradingHalted: systemState?.tradingHalted ?? false,
  };

  return (
    <aside className="w-56 shrink-0 border-r border-default-200 p-4">
      <div className="text-lg font-semibold mb-6">finance_next</div>
      <nav className="flex flex-col gap-1 text-sm">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="text-xs uppercase tracking-wide text-default-400 mt-4 mb-1">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded px-2 py-1.5 ${
                    active
                      ? "bg-primary-50 text-primary-700 font-medium"
                      : "hover:text-primary"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.trailing && (
                    <span className="ml-2 shrink-0">{item.trailing(ctx)}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
