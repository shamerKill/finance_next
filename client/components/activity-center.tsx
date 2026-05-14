// Activity Center popover — floating, always visible.
//
// Desktop (md+): docked bottom-left (`md:left-4 md:bottom-4`).
// Mobile (< md): docked bottom-right above the BottomNav
// (`bottom-[72px] right-4` — BottomNav is h-14 = 56px + 8px gap + 8px safe
// margin) so the pill never collides with the nav tab row.
//
// The popup width caps at 360px on desktop and shrinks to
// `calc(100vw-32px)` on mobile so a 375px viewport (iPhone SE) still has
// 16px gutters on either side.
//
// External callers can dispatch `window.dispatchEvent(new Event(
// "activitycenter:open"))` to programmatically open the panel — used by
// the settings/account "打开活动面板" button so the same UI is reachable
// from a settings card.

"use client";

import { Button, Switch } from "@heroui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ActivityItem,
  ActivityKind,
  ActivityStatus,
  useActivityCenter,
} from "@/data/use-activity-center";

export const KIND_LABELS: Record<ActivityKind, string> = {
  ingest: "数据抓取",
  backtest: "回测",
  optimization: "AI 优化",
  order: "下单",
  "claim-legacy": "数据迁移",
  "ai-test": "AI 连通测试",
  other: "其它",
};

export function relTime(ts: number, now: number): string {
  const dt = Math.max(0, Math.round((now - ts) / 1000));
  if (dt < 5) return "刚刚";
  if (dt < 60) return `${dt} 秒前`;
  if (dt < 3600) return `${Math.floor(dt / 60)} 分钟前`;
  if (dt < 86400) return `${Math.floor(dt / 3600)} 小时前`;
  return `${Math.floor(dt / 86400)} 天前`;
}

export function StatusDot({ status }: { status: ActivityStatus }) {
  switch (status) {
    case "running":
      return (
        <span
          aria-label="运行中"
          className="inline-block h-2.5 w-2.5 rounded-full bg-accent-info animate-pulse"
        />
      );
    case "success":
      return (
        <span
          aria-label="成功"
          className="inline-block h-2.5 w-2.5 rounded-full bg-accent-up"
        />
      );
    case "failed":
      return (
        <span
          aria-label="失败"
          className="inline-block h-2.5 w-2.5 rounded-full bg-accent-down"
        />
      );
    case "canceled":
      return (
        <span
          aria-label="已取消"
          className="inline-block h-2.5 w-2.5 rounded-full bg-text-tertiary"
        />
      );
  }
}

// ActivityRow is the single-line presentation used both inside the
// popover and (in compact form) inside the /settings/account preview.
// Exported so callers don't reinvent the dot + label + relative-time
// layout.
export function ActivityRow({
  item,
  now,
  compact = false,
}: {
  item: ActivityItem;
  now: number;
  compact?: boolean;
}) {
  return (
    <li
      className={`flex items-start gap-3 ${
        compact ? "py-1.5 px-2" : "py-2 px-3"
      } border-b border-border-default last:border-0 hover:bg-bg-surface-2`}
    >
      <div className="pt-1">
        <StatusDot status={item.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-mono-sm text-text-tertiary uppercase tracking-wide">
            {KIND_LABELS[item.kind]}
          </span>
          <span className="text-mono-sm text-text-tertiary ml-auto">
            {relTime(item.startedAt, now)}
          </span>
        </div>
        <div className="text-sm text-text-primary truncate" title={item.label}>
          {item.label}
        </div>
        {item.detail && !compact ? (
          <div
            className="text-mono-sm text-text-secondary truncate"
            title={item.detail}
          >
            {item.detail}
          </div>
        ) : null}
        {item.href && !compact ? (
          <Link
            href={item.href}
            className="text-mono-sm text-accent-info hover:underline"
          >
            查看 →
          </Link>
        ) : null}
      </div>
    </li>
  );
}

// External-trigger event name — dispatched on `window` to open the
// floating panel from anywhere (e.g. settings/account button).
export const ACTIVITY_CENTER_OPEN_EVENT = "activitycenter:open";

export function ActivityCenter() {
  const { enabled, setEnabled, items, clear } = useActivityCenter();
  const [open, setOpen] = useState(false);

  // Tick once a second so relative times stay fresh while panel is open.
  // useState + Date.now reads inline are cheaper than a setInterval that
  // forces re-renders when the panel is closed.
  const [now, setNow] = useState<number>(() => Date.now());
  useTickWhileOpen(open, setNow);

  // External callers can trigger the panel via a window CustomEvent —
  // the settings/account "打开活动面板" button uses this so it doesn't
  // need a shared `open` state outside the React tree.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(ACTIVITY_CENTER_OPEN_EVENT, handler);
    return () => window.removeEventListener(ACTIVITY_CENTER_OPEN_EVENT, handler);
  }, []);

  const running = items.filter((i) => i.status === "running").length;

  // Mobile: pin bottom-right above BottomNav (h-14 = 56px) with 16px gap.
  // Desktop (md+): switch to bottom-left, ignore BottomNav (hidden).
  return (
    <div className="fixed bottom-[72px] right-4 md:left-4 md:bottom-4 md:right-auto z-40">
      {open ? (
        <div className="w-[calc(100vw-32px)] max-w-[360px] max-h-[480px] flex flex-col rounded-lg border border-border-default bg-bg-surface shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">活动中心</span>
              <Switch
                size="sm"
                isSelected={enabled}
                onValueChange={setEnabled}
                aria-label="启用活动中心"
              />
              <span className="text-mono-sm text-text-tertiary">
                {enabled ? "已开启" : "已关闭"}
              </span>
            </div>
            <Button
              size="sm"
              variant="light"
              isIconOnly
              aria-label="收起"
              onPress={() => setOpen(false)}
            >
              ×
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!enabled ? (
              <div className="p-4 text-mono-sm text-text-secondary">
                活动中心已关闭。开启后这里会记录数据抓取、回测、AI 优化、连接测试等异步操作的实时状态。
              </div>
            ) : items.length === 0 ? (
              <div className="p-4 text-mono-sm text-text-secondary">
                暂无活动记录。触发&ldquo;抓取数据&rdquo;、&ldquo;开始回测&rdquo;、&ldquo;AI 优化&rdquo;等异步操作后，会在这里看到进度。
              </div>
            ) : (
              <ul>
                {items.map((item) => (
                  <ActivityRow key={item.id} item={item} now={now} />
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-border-default">
            <span className="text-mono-sm text-text-tertiary">
              共 {items.length} 条 · 进行中 {running}
            </span>
            <Button
              size="sm"
              variant="light"
              onPress={clear}
              isDisabled={items.length === 0}
            >
              清空
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`打开活动中心${running > 0 ? `（${running} 个进行中）` : ""}`}
          className="flex items-center gap-2 rounded-full border border-border-default bg-bg-surface px-3 py-2 shadow-lg hover:bg-bg-surface-2 transition"
        >
          <span className="relative flex items-center justify-center w-5 h-5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 text-text-secondary"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            {running > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent-info text-[10px] text-white flex items-center justify-center font-semibold">
                {running}
              </span>
            ) : null}
          </span>
          <span className="text-mono-sm text-text-secondary">活动中心</span>
        </button>
      )}
    </div>
  );
}

// Tiny internal helper: re-render the open panel once a second so
// relative timestamps update. Skipped when closed (no work).
function useTickWhileOpen(open: boolean, setNow: (n: number) => void) {
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, setNow]);
}
