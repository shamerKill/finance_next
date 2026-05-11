"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// DashboardRefresher drives a 30-second router.refresh() loop so the
// server-rendered cards above repaint with fresh /dashboard/summary data
// without a full page navigation. The button also gives operators an
// explicit "refresh now" handle; pressing it just calls router.refresh()
// — the optimistic spinner state below resets on the next render tick
// when the new server payload arrives.
//
// `generatedAt` is rendered next to the button as `上次刷新: HH:MM:SS`
// (local time, 24h). When the server fails to compute it, the prop is
// the empty string and the timestamp is hidden.
export function DashboardRefresher({ generatedAt }: { generatedAt: string }) {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  const handlePress = () => {
    setSpinning(true);
    router.refresh();
    // Drop the spinner indicator after a short delay; router.refresh()
    // does not give us a completion callback so this is purely visual.
    window.setTimeout(() => setSpinning(false), 600);
  };

  let label = "";
  if (generatedAt) {
    const d = new Date(generatedAt);
    if (!Number.isNaN(d.getTime())) {
      label = `上次刷新 ${d.toLocaleTimeString("zh-CN", { hour12: false })}`;
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs text-default-500">
      {label && <span>{label}</span>}
      <Button
        size="sm"
        variant="flat"
        onPress={handlePress}
        isLoading={spinning}
      >
        ↻ 刷新
      </Button>
    </div>
  );
}
