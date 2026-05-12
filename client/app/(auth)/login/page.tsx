"use client";

import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthError, login } from "@/data/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login({ email, password });
      // Gateway issued the Set-Cookie header in the same response. The
      // browser commits the cookie before the next request fires, so a
      // direct push to /dashboard is safe — getMe() inside the dashboard
      // layout will succeed.
      router.push("/dashboard");
    } catch (e2) {
      if (e2 instanceof AuthError) setErr(e2.message);
      else setErr("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col items-start gap-1">
        <div className="text-lg font-semibold">登录</div>
        <div className="text-sm text-default-500">使用邮箱和密码登录控制台</div>
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
            autoComplete="current-password"
            value={password}
            onValueChange={setPassword}
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
            登录
          </Button>
          <div className="flex justify-between text-sm text-default-500">
            <Link href="/register" className="hover:underline">
              注册新账户
            </Link>
            <Link href="/accept-invite" className="hover:underline">
              通过邀请注册
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
