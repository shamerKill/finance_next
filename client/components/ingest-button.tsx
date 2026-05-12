"use client";

import { Button, Tooltip } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/data/api-client";
import { useAdminKey } from "@/data/use-admin-key";

const baseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface IngestButtonProps {
  /** Path under /api (e.g. "v1/market/ingest" or "v1/admin/ingest/news"). */
  path: string;
  /** Optional body — defaults to {}. */
  body?: Record<string, unknown>;
  /** Button label. */
  label?: string;
  /**
   * Callback returning the **current** observable row count for the
   * page this button lives on. When supplied, the button polls this
   * function for up to ~60s after a successful XADD; the first time
   * the count goes up it calls router.refresh() to repaint the SSR
   * page with the new data and surfaces "新增 N 条". If the count
   * never changes within the timeout, surfaces "未增量（数据源去重 /
   * 无新条目）" so the user knows the ingest actually completed
   * rather than just timed out silently.
   *
   * When ``verify`` is omitted, falls back to the legacy behaviour:
   * 4 evenly-spaced ``router.refresh()`` calls at 5/10/20/30s.
   */
  verify?: () => Promise<number>;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; message: string }
  | { kind: "err"; message: string };

// Shared button for the various admin-key-gated ingest endpoints. Reads
// the admin key from localStorage; if absent, the button is rendered
// disabled with an explanatory tooltip pointing to the admin page.
export function IngestButton({
  path,
  body,
  label = "立即抓取数据",
  verify,
}: IngestButtonProps) {
  const router = useRouter();
  const adminKey = useAdminKey();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onClick = async () => {
    if (!adminKey) return;
    setStatus({ kind: "busy" });

    // Snapshot the initial count BEFORE the trigger so the verify
    // polling has something to compare against. If the user has a
    // stale page that already shows N rows and the consumer adds 0
    // new ones, count stays at N and we report "未增量".
    let initialCount: number | null = null;
    if (verify) {
      try {
        initialCount = await verify();
      } catch {
        // ignore — we'll skip the verify polling if we can't get a baseline
      }
    }

    try {
      const url = baseUrl + `/${path}`.replace("//", "/");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new ApiError(res.status, text || `HTTP ${res.status}`, text);
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 401 || e.status === 403
            ? "管理员密钥无效"
            : `触发失败：${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setStatus({ kind: "err", message: msg });
      return;
    }

    // The XADD succeeded. Now wait for the consumer to actually land
    // data. Two paths:
    //   (a) verify callback supplied → poll it for changes
    //   (b) no callback → fall back to a fixed schedule of refreshes
    setStatus({ kind: "ok", message: "已触发，等待数据落库…" });

    if (verify && initialCount !== null) {
      const startedAt = Date.now();
      const timeoutMs = 60_000;
      // First refresh quickly so even cached pages re-paint while
      // we're still polling — common case is data lands in <5s.
      const earlyRefresh = setTimeout(() => router.refresh(), 3_000);
      while (Date.now() - startedAt < timeoutMs) {
        await sleep(3_000);
        let current: number | null = null;
        try {
          current = await verify();
        } catch {
          // transient — keep polling
        }
        if (current !== null && current > initialCount) {
          clearTimeout(earlyRefresh);
          router.refresh();
          setStatus({
            kind: "ok",
            message: `已抓取（新增 ${current - initialCount} 条）`,
          });
          return;
        }
      }
      clearTimeout(earlyRefresh);
      // Trigger one final refresh anyway in case the count is
      // computed from a different filter than what we polled.
      router.refresh();
      setStatus({
        kind: "ok",
        message: "已触发，但 60s 内无增量（去重或源未更新）",
      });
      return;
    }

    // Legacy path: no verify callback. Fan out a few refreshes and call it.
    [5_000, 10_000, 20_000, 30_000].forEach((d) =>
      setTimeout(() => router.refresh(), d),
    );
    setStatus({ kind: "ok", message: "已触发数据采集（异步）" });
  };

  if (!adminKey) {
    return (
      <Tooltip content="请先在管理页面设置管理员密钥">
        <span>
          <Button size="sm" color="primary" isDisabled>
            {label}
          </Button>
        </span>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        color="primary"
        onPress={onClick}
        isLoading={status.kind === "busy"}
      >
        {label}
      </Button>
      {status.kind === "ok" && (
        <span className="text-xs text-success">{status.message}</span>
      )}
      {status.kind === "err" && (
        <span className="text-xs text-danger">{status.message}</span>
      )}
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
