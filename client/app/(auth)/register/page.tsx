"use client";

import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AuthError, register } from "@/data/auth-client";

// safeNextOrDashboard sanitises the `?next=` query param that
// middleware.ts attaches when an unauthenticated request was redirected
// here. Only same-origin relative paths are honoured ("/foo/bar"); any
// protocol-relative path ("//evil.com/x") or absolute URL is dropped
// in favour of /dashboard, which closes the open-redirect CVE that
// would otherwise apply when ?next= is naively forwarded.
function safeNextOrDashboard(raw: string | null | undefined): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/dashboard";
}

// Register supports two paths:
//   1. Bootstrap (the gateway has zero users): any email + password is
//      accepted and the caller becomes admin.
//   2. Subsequent users: the gateway requires an `inviteToken`. We only
//      reveal that input when the first attempt 403s — keeping the
//      bootstrap form free of optional clutter for the first run.
function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [needsInvite, setNeedsInvite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) {
      setErr("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await register({
        email,
        password,
        inviteToken: inviteToken || undefined,
      });
      router.push(safeNextOrDashboard(search?.get("next")));
    } catch (e2) {
      if (e2 instanceof AuthError) {
        if (e2.status === 403) {
          // Toggle into invite mode — most common reason is "registration
          // closed; an invitation token is required".
          setNeedsInvite(true);
          setErr(
            inviteToken
              ? "邀请令牌无效或已过期，请向管理员索取新的邀请"
              : "当前注册需要邀请令牌；请向管理员索取，或直接打开 /accept-invite 链接",
          );
        } else {
          setErr(e2.message);
        }
      } else {
        setErr("注册失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col items-start gap-1">
        <div className="text-lg font-semibold">注册</div>
        <div className="text-sm text-default-500">
          首次部署的第一个注册者将自动成为管理员
        </div>
      </CardHeader>
      <CardBody className="gap-4">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            label="邮箱"
            type="email"
            autoComplete="email"
            value={email}
            onValueChange={setEmail}
            isRequired
            isDisabled={loading}
          />
          <Input
            label="密码"
            type="password"
            autoComplete="new-password"
            value={password}
            onValueChange={setPassword}
            isRequired
            isDisabled={loading}
            description="至少 8 个字符"
          />
          <Input
            label="确认密码"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onValueChange={setConfirm}
            isRequired
            isDisabled={loading}
          />
          {needsInvite ? (
            <Input
              label="邀请令牌"
              value={inviteToken}
              onValueChange={setInviteToken}
              isDisabled={loading}
              description="由管理员通过 /settings → 邀请用户 生成"
            />
          ) : null}
          {err ? (
            <div
              role="alert"
              className="text-sm text-danger bg-danger-50 px-3 py-2 rounded whitespace-pre-line"
            >
              {err}
            </div>
          ) : null}
          <Button type="submit" color="primary" isLoading={loading}>
            注册
          </Button>
          <div className="flex justify-between text-sm text-default-500">
            <Link href="/login" className="hover:underline">
              已有账户？登录
            </Link>
            <Link href="/accept-invite" className="hover:underline">
              使用邀请链接
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// Next.js 15+ requires every `useSearchParams` consumer to be wrapped
// in a Suspense boundary so the static prerender doesn't crash on the
// missing param context. FIX-A adds it here for the ?next= handling.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
