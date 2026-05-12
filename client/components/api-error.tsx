"use client";

import Link from "next/link";

import { ApiError } from "@/data/api-client";

// Friendly Chinese rendering for API errors. Accepts any value (string,
// Error, ApiError, unknown) and degrades gracefully — pages that catch
// generic errors still get a reasonable message.
export function ApiErrorView({ error }: { error: unknown }) {
  if (!error) return null;

  let status = 0;
  let message = "";
  if (error instanceof ApiError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = String(error);
  }

  const text = friendlyMessage(status, message);

  return (
    <div className="rounded border border-danger-200 bg-danger-50 text-danger px-3 py-2 text-sm">
      {text}
      {(status === 401 || status === 403) && (
        <>
          {" "}
          <Link
            href="/settings/system"
            className="underline font-medium hover:opacity-80"
          >
            前往设置 →
          </Link>
        </>
      )}
    </div>
  );
}

function friendlyMessage(status: number, raw: string): string {
  switch (status) {
    case 401:
    case 403:
      // Covers three real cases: key never set, key set but wrong, gateway
      // restarted with a different ADMIN_KEY. The /settings/system link points the
      // user to where they can update / verify the key.
      return "无权访问 — 管理员密钥缺失或不正确。";
    case 404:
      return "资源不存在";
    case 400:
      return `请求参数错误：${raw || "未提供详细信息"}`;
    case 0:
      // No status (network error / non-ApiError throw). Show the raw text.
      return raw || "未知错误";
    default:
      if (status >= 500) {
        return `服务器错误（${status}）：${raw || "未提供详细信息"}`;
      }
      if (status >= 400) {
        return raw || `请求失败（${status}）`;
      }
      return raw || "未知错误";
  }
}
