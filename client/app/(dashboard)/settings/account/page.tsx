import { Callout } from "@/components/callout";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

// Personal settings shell. The actual fields (display name, password
// change, API tokens, notification preferences, etc.) land with Node
// 3.E.4 — this placeholder shows the section frame so the IA reads
// correctly today.
export default function SettingsAccountPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="个人设置"
        subtitle="账户信息、密码、个人偏好"
      />
      <Section title="即将开放">
        <Callout variant="info" title="3.E.4 实现中">
          个人资料、修改密码、通知偏好等设置项将在 Node 3.E.4 落地。
          当前可前往 /settings/system 等管理面板（需 admin 权限）。
        </Callout>
      </Section>
    </div>
  );
}
