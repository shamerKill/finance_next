import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

import { requireAdmin } from "../require-admin";

export default async function SettingsDataSourcesPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="数据源"
        subtitle="交易所凭据、市场数据源、宏观 / 链上 / 新闻 API 状态"
      />
      <Section title="即将开放">
        <Callout variant="info" title="需后端 system-info endpoint（3.E.2）">
          数据源的连接状态、最近抓取时间、key 配置情况依赖 Node 3.E.2
          落地的 system-info 端点。当前 ingest cron + admin XADD 入口仍按
          §5 文档运行。
        </Callout>
      </Section>
    </div>
  );
}
