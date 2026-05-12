import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

import { requireAdmin } from "../require-admin";

export default async function SettingsTradingPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="交易"
        subtitle="主网开关、mainnet token、风控全局参数"
      />
      <Section title="即将开放">
        <Callout variant="info" title="需后端 system-info endpoint（3.E.2）">
          mainnet gate / token TTL / per-venue 开关等聚合视图依赖 3.E.2
          落地。临时仍可通过 /api/v1/admin/mainnet/* 端点 + admin 密钥操作。
        </Callout>
      </Section>
    </div>
  );
}
