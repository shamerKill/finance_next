"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// RefreshButton triggers a server-component refresh via router.refresh().
// The parent page (accounts/[id]/page.tsx) is a server component that
// re-fetches balances/positions on render, so this is a cheap way to
// re-pull live data without rebuilding the whole client tree.
export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastClicked, setLastClicked] = useState<number | null>(null);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setLastClicked(Date.now());
        startTransition(() => {
          router.refresh();
        });
      }}
      className="text-xs px-2 py-1 rounded border border-default-300 hover:bg-default-100 disabled:opacity-50"
      title={
        lastClicked
          ? `上次刷新：${new Date(lastClicked).toLocaleTimeString("zh-CN")}`
          : "重新拉取余额 / 持仓"
      }
    >
      {pending ? "刷新中…" : "↻ 刷新"}
    </button>
  );
}
