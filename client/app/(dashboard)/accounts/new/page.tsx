"use client";

import { Button, Input, Select, SelectItem } from "@heroui/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createAccount } from "@/data/api-client";
import { TypeExchange } from "@/data/type";

const EXCHANGES: { key: TypeExchange; label: string; supported: boolean }[] = [
  { key: "binance", label: "Binance", supported: true },
  { key: "okx", label: "OKX（需要 passphrase）", supported: true },
  { key: "bybit", label: "Bybit", supported: true },
];

export default function NewAccountPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchange, setExchange] = useState<TypeExchange>("binance");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await createAccount({
        exchange,
        label: String(fd.get("label") ?? ""),
        email: String(fd.get("email") ?? ""),
        apiKey: String(fd.get("apiKey") ?? ""),
        secretKey: String(fd.get("secretKey") ?? ""),
        passphrase: fd.get("passphrase") ? String(fd.get("passphrase")) : undefined,
      });
      router.push("/accounts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-6">添加账户</h1>
      <p className="text-sm text-default-500 mb-4">
        支持只读和交易权限的密钥。带提现权限的密钥将在创建时被拒绝。
      </p>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Select
          label="交易所"
          selectedKeys={[exchange]}
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0] as TypeExchange | undefined;
            if (k) setExchange(k);
          }}
        >
          {EXCHANGES.map((e) => (
            <SelectItem key={e.key} isDisabled={!e.supported}>
              {e.label}
            </SelectItem>
          ))}
        </Select>
        <Input name="label" label="标签" required minLength={3} maxLength={32} />
        <Input name="email" label="邮箱" type="email" required />
        <Input name="apiKey" label="API 密钥" required />
        <Input name="secretKey" label="Secret 密钥" type="password" required />
        {exchange === "okx" && (
          <Input name="passphrase" label="Passphrase 口令" type="password" required />
        )}
        {error && (
          <div className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <Button type="submit" color="primary" isLoading={submitting}>
          创建
        </Button>
      </form>
    </div>
  );
}
