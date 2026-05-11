"use client";

import { Button, Checkbox, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { createWallet } from "@/data/api-client";

// F2.2 — HeroUI conversion. The 危险 warning block is now rendered
// via the shared <Callout variant="danger"> primitive; bullet list and
// content preserved verbatim.
export default function NewWalletPage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [expectedAddress, setExpectedAddress] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!acknowledged) {
      setError(new Error("继续之前必须确认安全警告。"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const w = await createWallet({
        label,
        privateKey: privateKey.trim(),
        expectedAddress: expectedAddress.trim() || undefined,
      });
      router.push(`/wallets/${w.id}`);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">添加 Polygon 钱包</h1>

      <div className="mb-6">
        <Callout variant="danger" title="危险 — 请仔细阅读">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>
                任何持有此私钥的人都可以控制钱包中的所有资金
              </strong>
              ，包括 USDC 和任何 outcome token。丢失/泄露不可挽回 —
              没有密码重置机制。
            </li>
            <li>
              私钥静态存储时使用 AES-256-GCM 加密（信封加密，与交易所 API
              密钥相同），并且{" "}
              <strong>永远不会在任何 API 响应中返回</strong>。
            </li>
            <li>
              审计日志会从每个请求体中清除私钥 — 但是任何有数据库访问权限
              的人仍可以用主 KEK 解密。
            </li>
            <li>
              <strong>请使用专用交易钱包</strong>
              ，只存放您能承受损失的资金。 不要粘贴您主钱包的助记词派生密钥。
            </li>
            <li>
              Polymarket <strong>没有测试网</strong>。
              真实交易需要通过三道闸流程（env + admin token + 策略
              mode=mainnet）。
            </li>
          </ul>
        </Callout>
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Input
          label="标签"
          placeholder="primary-trading"
          isRequired
          value={label}
          onValueChange={setLabel}
        />
        <Input
          label="私钥（64 位十六进制）"
          type="password"
          placeholder="0x..."
          isRequired
          value={privateKey}
          onValueChange={setPrivateKey}
          className="font-mono"
        />
        <Input
          label="预期地址（可选）"
          placeholder="0x..."
          value={expectedAddress}
          onValueChange={setExpectedAddress}
          className="font-mono"
        />

        <Checkbox
          isSelected={acknowledged}
          onValueChange={setAcknowledged}
        >
          我已了解上述风险，并已离线备份此私钥。
        </Checkbox>

        <ApiErrorView error={error} />

        <Button
          type="submit"
          color="primary"
          isLoading={submitting}
          isDisabled={!acknowledged}
        >
          创建钱包
        </Button>
      </form>
    </div>
  );
}
