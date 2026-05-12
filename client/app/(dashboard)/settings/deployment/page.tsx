import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

import { requireAdmin } from "../require-admin";

export default async function SettingsDeploymentPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="部署"
        subtitle="版本号、构建信息、KEK provider、备份状态"
      />
      <Section title="即将开放">
        <Callout variant="info" title="需后端 system-info endpoint（3.E.2）">
          gateway / quant 版本号、KEK provider（env / aws-kms / gcp-kms）、
          最近备份时间等部署信息依赖 Node 3.E.2 暴露的端点。当前请通过
          infra/k8s 配置 + infra/scripts 备份脚本管理。
        </Callout>
      </Section>
    </div>
  );
}
