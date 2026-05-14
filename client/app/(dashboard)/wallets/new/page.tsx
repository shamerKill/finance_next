"use client";

import { Button, Checkbox, Input } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { PasswordInput } from "@/components/password-field";
import { Section } from "@/components/section";
import { createWallet } from "@/data/api-client";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

// Node 2.C.5.e — adopt FormField + ConfirmDialog. The danger callout
// stays verbatim per spec §G5; private-key visibility toggle and
// two-step confirm preserve the safety story.

export default function NewWalletPage() {
  const router = useRouter();
  const activity = useActivityCenter();
  const [label, setLabel] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [expectedAddress, setExpectedAddress] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const validate = (): string | null => {
    if (!label.trim()) return "请填写标签";
    if (!privateKey.trim()) return "请填写私钥";
    if (!acknowledged) return "继续之前必须确认安全警告";
    return null;
  };

  const openConfirm = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(new Error(v));
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const w = await withActivity(
        activity,
        { kind: "other", label: `添加钱包 - ${label}` },
        () =>
          createWallet({
            label,
            privateKey: privateKey.trim(),
            expectedAddress: expectedAddress.trim() || undefined,
          }),
      );
      router.push(`/wallets/${w.id}`);
    } catch (err) {
      setError(err);
      setSubmitting(false);
      // Re-throw so ConfirmDialog keeps itself open on failure.
      throw err;
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader
        breadcrumb={
          <Link href="/wallets" className="hover:underline">
            ← 钱包
          </Link>
        }
        title="添加 Polygon 钱包"
      />

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

      <Section title="钱包信息">
        <form className="flex flex-col gap-4" onSubmit={openConfirm}>
          <FormField label="标签" required htmlFor="wallet-label">
            <Input
              id="wallet-label"
              placeholder="primary-trading"
              value={label}
              onValueChange={setLabel}
            />
          </FormField>

          <FormField
            label="私钥（64 位十六进制）"
            required
            htmlFor="wallet-pk"
            hint="提交后由 gateway 加密入库；私钥永不离开后端。"
          >
            <PasswordInput
              id="wallet-pk"
              placeholder="0x..."
              value={privateKey}
              onValueChange={setPrivateKey}
              className="font-mono"
            />
          </FormField>

          <FormField
            label="预期地址"
            htmlFor="wallet-addr"
            hint="可选 — 若填写，gateway 将校验派生地址与之匹配。"
          >
            <Input
              id="wallet-addr"
              placeholder="0x..."
              value={expectedAddress}
              onValueChange={setExpectedAddress}
              className="font-mono"
            />
          </FormField>

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
            isDisabled={!acknowledged || submitting}
          >
            创建钱包
          </Button>
        </form>
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认创建钱包？"
        message={
          <div className="space-y-2">
            <div>
              即将以标签 <strong>{label}</strong> 创建一个 Polygon 钱包。
              私钥将在 gateway 端使用 AES-256-GCM 信封加密后入库，
              <strong>永不离开后端</strong>。
            </div>
            <div className="text-xs text-text-tertiary">
              确认前请再次核对您已离线备份私钥。
            </div>
          </div>
        }
        confirmLabel={submitting ? "创建中…" : "确认创建"}
        confirmColor="danger"
        onConfirm={submit}
      />
    </div>
  );
}
