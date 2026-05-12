"use client";

import { Button, Input, Select, SelectItem } from "@heroui/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { PasswordInput } from "@/components/password-field";
import { useToast } from "@/components/toast";
import { createAccount } from "@/data/api-client";
import { TypeExchange } from "@/data/type";

const EXCHANGES: { key: TypeExchange; label: string; supported: boolean }[] = [
  { key: "binance", label: "Binance", supported: true },
  { key: "okx", label: "OKX（需要 passphrase）", supported: true },
  { key: "bybit", label: "Bybit", supported: true },
];

// Node 2.C.5.a — wrapped each input with <FormField label hint> per the
// design system; surfaced server errors through <ApiErrorView> and a
// success <useToast>. Conditional OKX passphrase rendering and the
// underlying createAccount() call are unchanged.
export default function NewAccountPage() {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
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
        passphrase: fd.get("passphrase")
          ? String(fd.get("passphrase"))
          : undefined,
      });
      toast.success("账户已创建", {
        description: "已通过权限探测，凭证已加密存储。",
      });
      router.push("/accounts");
      router.refresh();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="添加账户"
        subtitle="支持只读和交易权限的密钥。带提现权限的密钥将在创建时被拒绝。"
      />

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <FormField
          label="交易所"
          required
          hint="选择你要绑定的现货 / 合约交易所"
        >
          <Select
            aria-label="交易所"
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
        </FormField>

        <FormField label="标签" required hint="3-32 字符，便于在列表中识别">
          <Input
            name="label"
            aria-label="标签"
            required
            minLength={3}
            maxLength={32}
          />
        </FormField>

        <FormField label="邮箱" required>
          <Input name="email" aria-label="邮箱" type="email" required />
        </FormField>

        <FormField label="API 密钥" required>
          <Input name="apiKey" aria-label="API 密钥" required />
        </FormField>

        <FormField
          label="Secret 密钥"
          required
          hint="保存后将经 AES-256-GCM 信封加密，永远不会回显"
        >
          <PasswordInput
            name="secretKey"
            aria-label="Secret 密钥"
            isRequired
          />
        </FormField>

        {exchange === "okx" && (
          <FormField
            label="Passphrase 口令"
            required
            hint="OKX API key 创建时设置的 passphrase"
          >
            <PasswordInput
              name="passphrase"
              aria-label="Passphrase 口令"
              isRequired
            />
          </FormField>
        )}

        {error != null && <ApiErrorView error={error} />}

        <Button type="submit" color="primary" isLoading={submitting}>
          创建
        </Button>
      </form>
    </div>
  );
}
