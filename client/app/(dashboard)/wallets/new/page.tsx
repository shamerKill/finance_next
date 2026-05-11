"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createWallet } from "@/data/api-client";

export default function NewWalletPage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [expectedAddress, setExpectedAddress] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!acknowledged) {
      setError("继续之前必须确认安全警告。");
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
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">添加 Polygon 钱包</h1>

      <div className="rounded border-2 border-danger bg-danger/10 p-4 mb-6 text-sm">
        <div className="font-bold text-danger mb-2 text-base">
          ⚠️ 危险 — 请仔细阅读
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>任何持有此私钥的人都可以控制钱包中的所有资金</strong>，
            包括 USDC 和任何 outcome token。丢失/泄露不可挽回 — 没有
            密码重置机制。
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
            <strong>请使用专用交易钱包</strong>，只存放您能承受损失的资金。
            不要粘贴您主钱包的助记词派生密钥。
          </li>
          <li>
            Polymarket <strong>没有测试网</strong>。真实交易需要通过
            三道闸流程（env + admin token + 策略 mode=mainnet）。
          </li>
        </ul>
      </div>

      <form className="grid gap-4" onSubmit={submit}>
        <label className="text-sm flex flex-col gap-1">
          <span>标签</span>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-default-200 rounded px-2 py-1"
            placeholder="primary-trading"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>私钥（64 位十六进制）</span>
          <input
            required
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="border border-default-200 rounded px-2 py-1 font-mono"
            placeholder="0x..."
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>预期地址（可选，0x...）</span>
          <input
            value={expectedAddress}
            onChange={(e) => setExpectedAddress(e.target.value)}
            className="border border-default-200 rounded px-2 py-1 font-mono"
            placeholder="0x..."
          />
        </label>

        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>
            我已了解上述风险，并已离线备份此私钥。
          </span>
        </label>

        {error && (
          <div className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-primary text-white text-sm disabled:opacity-50"
        >
          {submitting ? "创建中…" : "创建钱包"}
        </button>
      </form>
    </div>
  );
}
