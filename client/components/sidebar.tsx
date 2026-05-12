"use client";

import { Tooltip } from "@heroui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { listRecommendations } from "@/data/api-client";
import { useSystemState } from "@/data/use-system-state";

export interface NavItem {
  href: string;
  label: string;
  // Optional slot rendered after the label — used for badges / dots.
  trailing?: (ctx: SidebarContext) => ReactNode;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarContext {
  pendingRecommendations: number;
  tradingHalted: boolean;
}

export const SIDEBAR_GROUPS: NavGroup[] = [
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
    label: "设置",
    items: [
      { href: "/settings/account", label: "个人" },
      {
        href: "/settings/system",
        label: "系统",
        trailing: ({ tradingHalted }) =>
          tradingHalted ? (
            <span
              aria-label="交易已暂停"
              title="交易已暂停"
              className="inline-block h-2 w-2 rounded-full bg-danger"
            />
          ) : null,
      },
      { href: "/settings/ai", label: "AI" },
      { href: "/settings/data-sources", label: "数据源" },
      { href: "/settings/trading", label: "交易" },
      { href: "/settings/observability", label: "监控" },
      { href: "/settings/deployment", label: "部署" },
      { href: "/admin/audit", label: "审计" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  // Treat subpaths as active too, so e.g. /backtests/abc highlights the
  // /backtests entry. Guard against /a matching /abc by requiring "/".
  return pathname.startsWith(href + "/");
}

// Module-level singleton that both <MobileHeader> and <Sidebar> read.
// The dashboard layout renders them as separate children (so the aside
// can sit alongside <main> in the flex row), but they need to agree on
// drawer open/closed state. A 3-line singleton + subscription beats
// hoisting drawer state into the layout (which would force the layout
// to become a client component and lose its SSR async children).
type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();
let drawerState = false;
function setDrawer(open: boolean) {
  drawerState = open;
  listeners.forEach((l) => l(open));
}
function useDrawerOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(drawerState);
  useEffect(() => {
    const l = (v: boolean) => setOpen(v);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [open, setDrawer];
}

// Shared SidebarContext (pending recs + halt). Provided by <Sidebar>
// once at the top of the dashboard tree so the mobile header can also
// render the same badges if needed. Default values keep type narrow
// while the provider hasn't mounted yet (SSR / initial paint).
const SidebarCtxContext = createContext<SidebarContext>({
  pendingRecommendations: 0,
  tradingHalted: false,
});

// SidebarNav renders the actual link tree. It's extracted so the same
// markup powers both the permanent desktop sidebar and the mobile drawer
// body. `onNavigate` lets the drawer auto-close after a tap.
function SidebarNav({
  pathname,
  ctx,
  onNavigate,
}: {
  pathname: string;
  ctx: SidebarContext;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {SIDEBAR_GROUPS.map((group) => (
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
                onClick={onNavigate}
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
  );
}

// Single-glyph fallback when an item has no explicit icon. Renders the
// first character of the Chinese label (e.g. "策" / "回" / "审"). Crude
// but completely free — no icon-library dependency, no SVG drift.
function ItemGlyph({ label }: { label: string }) {
  const ch = label.trim().charAt(0) || "?";
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded text-sm font-medium">
      {ch}
    </span>
  );
}

// Collapsed (icon-rail) nav used on `md~lg`. Each entry is a single
// glyph rendered inside a HeroUI <Tooltip> that pops out the full label
// on hover. Group headers are omitted in this mode (no horizontal space)
// but the items keep their original ordering so muscle-memory survives.
function SidebarRail({
  pathname,
  ctx,
  onNavigate,
}: {
  pathname: string;
  ctx: SidebarContext;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col items-center gap-1 text-sm">
      {SIDEBAR_GROUPS.map((group, gi) => (
        <div key={group.label} className="flex flex-col items-center gap-1">
          {gi > 0 && (
            <div className="w-6 my-1 border-t border-border-default" aria-hidden />
          )}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const trailing = item.trailing?.(ctx);
            return (
              <Tooltip
                key={item.href}
                content={item.label}
                placement="right"
                delay={300}
              >
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-label={item.label}
                  className={`relative flex items-center justify-center w-10 h-10 rounded ${
                    active
                      ? "bg-primary-50 text-primary-700"
                      : "text-text-secondary hover:bg-default-100 hover:text-text-primary"
                  }`}
                >
                  <ItemGlyph label={item.label} />
                  {trailing && (
                    <span className="absolute -top-1 -right-1 pointer-events-none">
                      {trailing}
                    </span>
                  )}
                </Link>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// Mobile header — visible <lg only. Renders the hamburger button that
// opens the shared drawer. Lives outside <Sidebar> so the dashboard
// layout can keep it at the top of the document flow while the
// permanent aside sits alongside <main> in the row below.
export function MobileHeader({ trailing }: { trailing?: ReactNode } = {}) {
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border-default bg-bg-surface px-4 py-3">
      <button
        type="button"
        onClick={() => setDrawer(true)}
        aria-label="打开菜单"
        className="rounded p-1 hover:bg-default-100"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="font-semibold">finance_next</span>
      <div className="flex items-center gap-1 shrink-0">
        {trailing ?? <span className="w-6" aria-hidden />}
      </div>
    </header>
  );
}

export function Sidebar({ collapsed = false }: { collapsed?: boolean } = {}) {
  const pathname = usePathname() ?? "";
  const systemState = useSystemState();
  const [pending, setPending] = useState(0);
  const [drawerOpen, setDrawerOpen] = useDrawerOpen();

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

  // Auto-close the drawer whenever the route changes — covers both
  // clicks on links inside the drawer and back/forward nav. We
  // intentionally trigger on `pathname` rather than relying solely on
  // the per-link onClick so router.push() from any source closes us.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, setDrawerOpen]);

  // Esc closes the drawer. Bound only while open to avoid registering a
  // global keydown listener for the lifetime of the app.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, setDrawerOpen]);

  // Lock body scroll while the drawer is open so the underlying page
  // doesn't scroll under the backdrop on iOS Safari.
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [drawerOpen]);

  const ctx: SidebarContext = {
    pendingRecommendations: pending,
    tradingHalted: systemState?.tradingHalted ?? false,
  };

  return (
    <SidebarCtxContext.Provider value={ctx}>
      {/* Permanent desktop sidebar — visible md+ only. Renders as a 60px
          icon rail in collapsed mode (md ~ lg) and a 224px labelled
          aside in full mode (lg+). The route-group layout chooses which
          mode to ask for via the `collapsed` prop. */}
      {collapsed ? (
        <aside
          className="hidden md:flex lg:hidden flex-col items-center w-[60px] shrink-0 border-r border-border-default bg-bg-surface py-3"
          aria-label="侧边导航"
        >
          <div
            className="text-base font-semibold mb-4"
            aria-label="finance_next"
          >
            f
          </div>
          <SidebarRail pathname={pathname} ctx={ctx} />
        </aside>
      ) : (
        <aside className="hidden lg:block w-56 shrink-0 border-r border-border-default bg-bg-surface p-4">
          <div className="text-lg font-semibold mb-6">finance_next</div>
          <SidebarNav pathname={pathname} ctx={ctx} />
        </aside>
      )}

      {/* Mobile drawer + backdrop. Rendered always (to allow CSS
          transitions); pointer-events / opacity gated on `drawerOpen`.
          Hidden on md+ since tablets get the icon rail and desktops get
          the full labelled aside — neither needs the drawer overlay. */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity ${
          drawerOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!drawerOpen}
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="关闭菜单"
          onClick={() => setDrawerOpen(false)}
          className="absolute inset-0 bg-black/40"
        />
        {/* Drawer panel */}
        <aside
          className={`absolute left-0 top-0 h-full w-[280px] max-w-[80%] bg-bg-surface p-4 shadow-xl transition-transform ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-label="导航"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-semibold">finance_next</div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="关闭菜单"
              className="rounded p-1 hover:bg-default-100"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <SidebarNav
            pathname={pathname}
            ctx={ctx}
            onNavigate={() => setDrawerOpen(false)}
          />
        </aside>
      </div>
    </SidebarCtxContext.Provider>
  );
}

// Optional escape hatch for descendants that want to read the same
// pending/halt context. Currently unused outside this module but
// exported for future cross-component use.
export function useSidebarContext(): SidebarContext {
  return useContext(SidebarCtxContext);
}
