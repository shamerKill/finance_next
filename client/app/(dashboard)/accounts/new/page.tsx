"use client";

import { Button, Input, Select, SelectItem } from "@heroui/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createAccount } from "@/data/api-client";
import { TypeExchange } from "@/data/type";

const EXCHANGES: { key: TypeExchange; label: string; supported: boolean }[] = [
  { key: "binance", label: "Binance", supported: true },
  { key: "okx", label: "OKX (phase 5)", supported: false },
  { key: "bybit", label: "Bybit (phase 5)", supported: false },
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
      <h1 className="text-2xl font-semibold mb-6">Add account</h1>
      <p className="text-sm text-default-500 mb-4">
        Read+trade keys are accepted. Keys with withdraw permission are rejected
        on creation.
      </p>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Select
          label="Exchange"
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
        <Input name="label" label="Label" required minLength={3} maxLength={32} />
        <Input name="email" label="Email" type="email" required />
        <Input name="apiKey" label="API key" required />
        <Input name="secretKey" label="Secret key" type="password" required />
        {exchange === "okx" && (
          <Input name="passphrase" label="Passphrase" type="password" required />
        )}
        {error && (
          <div className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <Button type="submit" color="primary" isLoading={submitting}>
          Create
        </Button>
      </form>
    </div>
  );
}
