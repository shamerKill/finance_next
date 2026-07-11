import Link from "next/link";

import { PageHeader } from "@/components/page-header";

import { AIGoalClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI 赚钱" };

export default function AIMoneyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 赚钱"
        subtitle="输入目标，让 AI 汇总市场、舆情、行为因素与执行约束，生成可复核的策略蓝图。"
        action={
          <Link
            href="/settings/ai"
            className="rounded border border-border-default bg-bg-surface px-3 py-1.5 text-sm hover:bg-bg-surface-2"
          >
            AI 配置
          </Link>
        }
      />
      <AIGoalClient />
    </div>
  );
}
