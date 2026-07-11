"use client";

import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { PasswordInput } from "@/components/password-field";
import { AuthError, acceptInvite } from "@/data/auth-client";
import { authHrefWithNext, safeNextOrDefault } from "@/data/auth-redirect.mjs";

function AcceptInviteForm() {
  const router = useRouter();
  const search = useSearchParams();
  // Pre-fill the token from `?token=...` when the user lands via the
  // invite URL. Using a lazy initialiser here (instead of a
  // useEffect + setState) avoids the cascading-renders lint rule and
  // is also strictly cheaper: the search params are stable on the
  // first render this client component receives.
  const [token, setToken] = useState(() => search?.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nextParam = search?.get("next");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!token) {
      setErr("请提供邀请令牌");
      return;
    }
    if (password !== confirm) {
      setErr("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await acceptInvite({ token, password });
      router.push(safeNextOrDefault(nextParam));
    } catch (e2) {
      if (e2 instanceof AuthError) setErr(e2.message);
      else setErr("接受邀请失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col items-start gap-1">
        <div className="text-lg font-semibold">接受邀请</div>
        <div className="text-sm text-default-500">
          使用邀请令牌为您的账户设置密码
        </div>
      </CardHeader>
      <CardBody className="gap-4">
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            label="邀请令牌"
            value={token}
            onValueChange={setToken}
            isRequired
            isDisabled={loading}
            description="一般通过链接预填，无需手动输入"
          />
          <PasswordInput
            label="密码"
            autoComplete="new-password"
            value={password}
            onValueChange={setPassword}
            isRequired
            isDisabled={loading}
            description="至少 8 个字符"
          />
          <PasswordInput
            label="确认密码"
            autoComplete="new-password"
            value={confirm}
            onValueChange={setConfirm}
            isRequired
            isDisabled={loading}
          />
          {err ? (
            <div
              role="alert"
              className="text-sm text-danger bg-danger-50 px-3 py-2 rounded"
            >
              {err}
            </div>
          ) : null}
          <Button type="submit" color="primary" isLoading={loading}>
            完成注册
          </Button>
          <div className="text-sm text-default-500">
            <Link
              href={authHrefWithNext("/login", nextParam)}
              className="hover:underline"
            >
              已有账户？登录
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// Next.js 15+ requires `useSearchParams` consumers to be wrapped in a
// Suspense boundary; we do that locally so the route still renders
// during the initial server render even before the search params are
// known on the client.
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
