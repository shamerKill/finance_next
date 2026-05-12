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
  /** Re-fetch the current route after a successful trigger (5s delay). */
  refresh?: boolean;
}

// Shared button for the various admin-key-gated ingest endpoints. Reads
// the admin key from localStorage; if absent, the button is rendered
// disabled with an explanatory tooltip pointing to the admin page.
export function IngestButton({
  path,
  body,
  label = "立即抓取数据",
  refresh = true,
}: IngestButtonProps) {
  const router = useRouter();
  const adminKey = useAdminKey();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "ok"; message: string }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  const onClick = async () => {
    if (!adminKey) return;
    setStatus({ kind: "busy" });
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
      setStatus({ kind: "ok", message: "已触发数据采集（异步），等待结果…" });
      if (refresh) {
        // 5s was too short for real network ingests (CryptoPanic / RSS /
        // ccxt all need 10-30s end-to-end). Poll the route 4 times at
        // increasing intervals so the user sees the new data when it
        // actually lands, instead of staring at an unchanged page.
        const delays = [5000, 10000, 20000, 30000];
        delays.forEach((d) =>
          setTimeout(() => router.refresh(), d),
        );
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
    }
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
