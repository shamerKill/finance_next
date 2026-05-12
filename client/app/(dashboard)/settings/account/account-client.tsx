"use client";

import { Button, Input, Radio, RadioGroup } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { useToast } from "@/components/toast";
import {
  AuthError,
  changePassword,
  deleteSelf,
  invite,
} from "@/data/auth-client";
import type { TypeInviteResult, TypeUser, TypeUserRole } from "@/data/type";

// Node 3.E.4 — /settings/account client. Server component hands us the
// already-authenticated user; everything below is interactive (state +
// network) so the whole tree is client-side. Mobile-friendly layout:
// stacked sections, labels above inputs, 44px+ touch targets via the
// HeroUI defaults.

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AccountClient({ me }: { me: TypeUser }) {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="个人设置"
        subtitle="账户信息、密码、邀请成员、删除账户"
      />

      <Section title="基本信息">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="邮箱" value={<span className="text-sm break-all">{me.email}</span>} />
          <Stat
            label="角色"
            value={
              <span className="text-sm">
                {me.role === "admin" ? "管理员 (admin)" : "成员 (member)"}
              </span>
            }
          />
          <Stat
            label="注册时间"
            value={<span className="text-sm">{fmtDate(me.createdAt)}</span>}
            hint={
              me.lastLoginAt ? `最近登录 ${fmtDate(me.lastLoginAt)}` : "暂无登录记录"
            }
          />
        </div>
      </Section>

      <Section title="修改密码">
        <ChangePasswordForm />
      </Section>

      {me.role === "admin" && (
        <Section title="邀请成员">
          <InviteForm />
        </Section>
      )}

      <Section title="删除账户" className="border-danger-200">
        <DeleteAccountForm me={me} />
      </Section>
    </div>
  );
}

// ---------- Change password ----------

function ChangePasswordForm() {
  const toast = useToast();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Client-side validation. The gateway re-validates, but we surface
  // the obvious errors inline so the user doesn't round-trip to learn
  // their new password is too short.
  function validate(): string | null {
    if (!oldPw) return "请输入旧密码";
    if (newPw.length < PASSWORD_MIN || newPw.length > PASSWORD_MAX) {
      return `新密码长度需在 ${PASSWORD_MIN}-${PASSWORD_MAX} 字符之间`;
    }
    if (newPw !== confirmPw) return "两次输入的新密码不一致";
    if (newPw === oldPw) return "新密码不能与旧密码相同";
    return null;
  }

  async function onConfirm() {
    setError(null);
    try {
      await changePassword({ oldPassword: oldPw, newPassword: newPw });
      toast.success("密码已更新");
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : (e as Error).message;
      setError(msg);
      toast.error("修改密码失败", { description: msg });
      // Re-throw so ConfirmDialog keeps itself open and the busy spinner
      // resets — UX hint that something went wrong.
      throw e;
    }
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setOpen(true);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <FormField label="旧密码" required htmlFor="cp-old">
        <Input
          id="cp-old"
          type="password"
          value={oldPw}
          onValueChange={setOldPw}
          autoComplete="current-password"
        />
      </FormField>
      <FormField
        label="新密码"
        required
        hint={`长度 ${PASSWORD_MIN}-${PASSWORD_MAX} 字符`}
        htmlFor="cp-new"
      >
        <Input
          id="cp-new"
          type="password"
          value={newPw}
          onValueChange={setNewPw}
          autoComplete="new-password"
        />
      </FormField>
      <FormField label="确认新密码" required htmlFor="cp-confirm">
        <Input
          id="cp-confirm"
          type="password"
          value={confirmPw}
          onValueChange={setConfirmPw}
          autoComplete="new-password"
        />
      </FormField>
      {error && (
        <div className="text-sm text-danger" role="alert">
          {error}
        </div>
      )}
      <div>
        <Button type="submit" color="primary">
          更新密码
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="确认修改密码"
        message="提交后旧密码将立即失效，请妥善保管新密码。"
        confirmLabel="确认修改"
        confirmColor="primary"
        onConfirm={onConfirm}
      />
    </form>
  );
}

// ---------- Invite ----------

function InviteForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TypeUserRole>("member");
  const [result, setResult] = useState<TypeInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("请输入合法邮箱");
      return;
    }
    setOpen(true);
  }

  async function onConfirm() {
    setError(null);
    try {
      const r = await invite({ email: email.trim(), role });
      setResult(r);
      toast.success("邀请链接已生成");
      setEmail("");
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : (e as Error).message;
      setError(msg);
      toast.error("生成邀请失败", { description: msg });
      throw e;
    }
  }

  async function copyUrl() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      toast.success("已复制到剪贴板");
    } catch {
      toast.warning("复制失败，请手动选中复制");
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Callout variant="info">
        生成一次性邀请链接（24 小时有效）发给对方。对方打开后可注册账户并自动绑定指定角色。
      </Callout>
      <FormField label="对方邮箱" required htmlFor="inv-email">
        <Input
          id="inv-email"
          type="email"
          value={email}
          onValueChange={setEmail}
          placeholder="someone@example.com"
        />
      </FormField>
      <FormField label="授予角色" required>
        <RadioGroup
          orientation="horizontal"
          value={role}
          onValueChange={(v) => setRole(v as TypeUserRole)}
        >
          <Radio value="member">成员 (member)</Radio>
          <Radio value="admin">管理员 (admin)</Radio>
        </RadioGroup>
      </FormField>
      {error && (
        <div className="text-sm text-danger" role="alert">
          {error}
        </div>
      )}
      <div>
        <Button type="submit" color="primary">
          生成邀请链接
        </Button>
      </div>

      {result && (
        <div className="rounded border border-default-200 p-3 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wide">
            邀请链接（请通过私密渠道发送）
          </div>
          <div className="break-all font-mono text-xs bg-bg-base p-2 rounded">
            {result.inviteUrl}
          </div>
          <div className="text-xs text-text-tertiary">
            过期时间 {fmtDate(result.expiresAt)}
          </div>
          <div>
            <Button size="sm" variant="flat" onPress={copyUrl}>
              复制链接
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="确认生成邀请"
        message={
          <span>
            将为 <b>{email.trim()}</b> 生成 <b>{role === "admin" ? "管理员" : "成员"}</b> 角色的邀请链接，
            请通过私密渠道发送，避免泄露。
          </span>
        }
        confirmLabel="生成"
        confirmColor="primary"
        onConfirm={onConfirm}
      />
    </form>
  );
}

// ---------- Delete account ----------

function DeleteAccountForm({ me }: { me: TypeUser }) {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // The backend is the final authority on "唯一 admin 不能删"; the
  // frontend hint here is best-effort UX — we don't have an admin count
  // endpoint to be precise, so we just warn admins universally and let
  // the 403 from the gateway speak the truth when applicable.
  const adminWarning = me.role === "admin";

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!password) {
      setError("请输入密码以确认身份");
      return;
    }
    setOpen(true);
  }

  async function onConfirm() {
    setError(null);
    try {
      await deleteSelf({ password });
      toast.success("账户已删除");
      // Cookie has been cleared by the gateway. Hard nav to /login so
      // the page tree re-renders without any cached auth state.
      router.push("/login");
    } catch (e) {
      const msg = e instanceof AuthError ? e.message : (e as Error).message;
      setError(msg);
      toast.error("删除账户失败", { description: msg });
      throw e;
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Callout variant="danger" title="此操作不可撤销">
        删除账户后无法恢复。你创建的策略、账户配置、回测结果等数据将保留在数据库中，
        但你将无法再登录访问。请输入当前密码二次确认。
        {adminWarning && (
          <div className="mt-2 text-xs">
            注意：如果你是系统中唯一的管理员，服务端将拒绝删除（避免系统失去管理权限）。
          </div>
        )}
      </Callout>
      <FormField label="当前密码" required htmlFor="del-pw">
        <Input
          id="del-pw"
          type="password"
          value={password}
          onValueChange={setPassword}
          autoComplete="current-password"
        />
      </FormField>
      {error && (
        <div className="text-sm text-danger" role="alert">
          {error}
        </div>
      )}
      <div>
        <Button type="submit" color="danger">
          删除我的账户
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="再次确认：删除账户"
        message="此操作不可撤销，删除后你将立即被登出并无法再次登录此账户。"
        confirmLabel="确认删除"
        confirmColor="danger"
        onConfirm={onConfirm}
      />
    </form>
  );
}
