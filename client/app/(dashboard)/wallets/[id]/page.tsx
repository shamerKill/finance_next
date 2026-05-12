"use client";

import { Button, Input } from "@heroui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { useToast } from "@/components/toast";
import {
  approveWallet,
  getWallet,
  getWalletBalance,
  getWalletPositions,
} from "@/data/api-client";
import {
  TypeWallet,
  TypeWalletBalance,
  TypeWalletPosition,
} from "@/data/type";
import { pushRecent } from "@/data/use-recent-resources";

// Node 2.C.5.e — adopt design system primitives (Stat / ConfirmDialog /
// FormField / DataTable). All approval security gates remain backend-
// enforced; the UI only adds an extra two-step confirm + decimal-only
// input around them.

export default function WalletDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const toast = useToast();
  const [wallet, setWallet] = useState<TypeWallet | null>(null);
  const [balance, setBalance] = useState<TypeWalletBalance | null>(null);
  const [positions, setPositions] = useState<TypeWalletPosition[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [approveAmt, setApproveAmt] = useState("");
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const w = await getWallet(id);
        if (!cancel) {
          setWallet(w);
          pushRecent({
            id,
            kind: "wallet",
            label: w.label,
            path: `/wallets/${id}`,
          });
        }
        const b = await getWalletBalance(id).catch(() => null);
        if (!cancel) setBalance(b);
        const p = await getWalletPositions(id).catch(() => []);
        if (!cancel) setPositions(p);
      } catch (e) {
        if (!cancel) setError(e);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const validateApprove = (): string | null => {
    const amt = parseFloat(approveAmt);
    if (!Number.isFinite(amt) || amt <= 0) return "金额必须 > 0";
    return null;
  };

  const openApproveConfirm = () => {
    setApproveErr(null);
    const v = validateApprove();
    if (v) {
      setApproveErr(v);
      return;
    }
    setConfirmOpen(true);
  };

  const submitApprove = async () => {
    const amt = parseFloat(approveAmt);
    try {
      const res = await approveWallet(id, amt);
      toast.success("已授权", {
        description: `授权 $${res.amountApproved.toFixed(2)} — tx ${res.txHash}`,
      });
      const b = await getWalletBalance(id).catch(() => null);
      setBalance(b);
      setApproveAmt("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setApproveErr(msg);
      toast.error("授权失败", { description: msg });
      throw e;
    }
  };

  const breadcrumb = (
    <Link href="/wallets" className="hover:underline">
      ← 钱包
    </Link>
  );

  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="钱包详情" />
        <ApiErrorView error={error} />
      </div>
    );
  }
  if (!wallet) {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title="加载中…" />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        breadcrumb={breadcrumb}
        title={wallet.label}
        subtitle={
          <span className="font-mono text-mono-sm tnum break-all">
            {wallet.address}
          </span>
        }
      />

      <Section title="USDC 余额 + 授权额度">
        {balance ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Stat
              label="USDC 余额"
              value={`$${balance.balanceUsdc.toFixed(2)}`}
              hint={`快照：${new Date(balance.fetchedAt).toLocaleString()}`}
            />
            <Stat
              label="授权额度"
              value={`$${balance.allowanceUsdc.toFixed(2)}`}
              hint="Polymarket CTF 合约对此钱包的 USDC 授权"
            />
          </div>
        ) : (
          <div className="text-sm text-text-tertiary">
            Polygon RPC 未配置或余额获取失败。
          </div>
        )}
      </Section>

      <Section title="USDC 限额授权（管理员）">
        <Callout variant="warning">
          授权额度受 <code>portfolio_limits.maxOpenNotionalUsd</code> 硬性限制。
          <strong> 无限额度授权在设计上不可能</strong>。需要 admin 角色登录。
        </Callout>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <FormField
            label="金额（USDC）"
            htmlFor="approve-amt"
            error={approveErr ?? undefined}
            className="w-48"
          >
            <Input
              id="approve-amt"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={approveAmt}
              onValueChange={setApproveAmt}
              classNames={{ input: "font-mono tnum" }}
            />
          </FormField>
          <Button color="warning" onPress={openApproveConfirm}>
            授权
          </Button>
        </div>
      </Section>

      <Section title="CTF outcome 持仓">
        {positions.length === 0 ? (
          <div className="text-sm text-text-tertiary">无持仓。</div>
        ) : (
          <DataTable<TypeWalletPosition>
            ariaLabel="CTF outcome 持仓"
            mobileLayout="card"
            rows={positions}
            getRowKey={(p) => p.tokenId}
            columns={[
              {
                key: "tokenId",
                label: "Token ID",
                render: (p) => (
                  <span className="font-mono text-mono-sm break-all">
                    {p.tokenId}
                  </span>
                ),
              },
              {
                key: "outcome",
                label: "Outcome",
                render: (p) => p.outcome ?? "—",
              },
              {
                key: "balance",
                label: "数量",
                align: "end",
                render: (p) => (
                  <span className="font-mono tnum">
                    {p.balance.toFixed(4)}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认 USDC 授权？"
        message={
          <div className="space-y-2">
            <div>
              即将对钱包 <strong>{wallet.label}</strong> 授权{" "}
              <span className="font-mono tnum">
                ${parseFloat(approveAmt || "0").toFixed(2)}
              </span>{" "}
              USDC 给 Polymarket CTF 合约。
            </div>
            <div className="text-xs text-text-tertiary">
              gateway 会强制将该金额限制在{" "}
              <code>portfolio_limits.maxOpenNotionalUsd</code> 以内。
            </div>
          </div>
        }
        confirmLabel="确认授权"
        confirmColor="danger"
        onConfirm={submitApprove}
      />
    </div>
  );
}
