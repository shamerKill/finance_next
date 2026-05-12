"use client";

// Client island for the config / risk panel: live toggle, mode select,
// account picker, risk caps, and the danger-zone delete button. Each
// mutation calls router.refresh() on success so the server-rendered
// performance cards re-fetch with the new state instead of going stale.
//
// 2.C.5.b refactor — uses design-system FormField / Section / Callout /
// ConfirmDialog / toast helpers. Live toggle keeps the HeroUI Switch as
// the spec requires; mainnet selection surfaces a Callout warning inline.

import { Button, Input, Select, SelectItem, Switch } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Callout } from "@/components/callout";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { deleteOption, setLive, setRisk } from "@/data/api-client";
import type { TypeAccount, TypeLiveMode, TypeOption } from "@/data/type";

type Props = {
  strategy: TypeOption;
  accounts: TypeAccount[];
};

export function ConfigPanel({ strategy, accounts }: Props) {
  const router = useRouter();
  const toast = useToast();
  const id = strategy.id ?? "";

  const [enabled, setEnabled] = useState(!!strategy.live?.enabled);
  const [mode, setMode] = useState<TypeLiveMode>(
    (strategy.live?.mode as TypeLiveMode) ?? "testnet",
  );
  const [accountId, setAccountId] = useState(strategy.live?.accountId ?? "");

  const [maxPosition, setMaxPosition] = useState<number>(
    strategy.risk?.maxPositionUsd ?? 0,
  );
  const [maxLeverage, setMaxLeverage] = useState<number>(
    strategy.risk?.maxLeverage ?? 0,
  );
  const [dailyLoss, setDailyLoss] = useState<number>(
    strategy.risk?.dailyLossCapUsd ?? 0,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two distinct confirm dialogs — live toggle (warning) and delete
  // (danger). Each captures its own pending state.
  const [confirmLive, setConfirmLive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveLive = async () => {
    setBusy(true);
    setError(null);
    try {
      await setLive(id, { enabled, mode, accountId });
      router.refresh();
      toast.success("实盘配置已保存");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("保存失败", { description: msg });
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const saveRisk = async () => {
    setBusy(true);
    setError(null);
    try {
      await setRisk(id, {
        maxPositionUsd: maxPosition,
        maxLeverage,
        dailyLossCapUsd: dailyLoss,
      });
      router.refresh();
      toast.success("风控上限已保存");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("保存失败", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setError(null);
    try {
      await deleteOption(id);
      toast.success("策略已删除");
      // Navigate back to the strategies list; refresh() alone would
      // 404 on the now-deleted detail route.
      router.push("/strategies");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("删除失败", { description: msg });
      throw e;
    }
  };

  // Two-step: clicking "Save live" with the toggle ON goes through a
  // confirm dialog (especially important for mainnet); other state
  // transitions save directly.
  const onSaveLiveClick = () => {
    if (enabled) {
      setConfirmLive(true);
    } else {
      void saveLive();
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Callout variant="danger" title="操作失败">
          {error}
        </Callout>
      )}

      <Section title="实盘控制">
        <div className="space-y-4 text-sm">
          <FormField label="启用实盘" hint="开启后将向交易所发送真实订单">
            <div className="flex items-center gap-3 py-1">
              <Switch
                size="sm"
                isSelected={enabled}
                onValueChange={setEnabled}
                aria-label="启用实盘"
              />
              <span className="text-text-secondary">
                {enabled ? "已启用" : "已关闭"}
              </span>
            </div>
          </FormField>

          <FormField label="模式" hint="主网需管理员闸门授权">
            <Select
              size="sm"
              aria-label="模式"
              selectedKeys={[mode]}
              onChange={(e) => setMode(e.target.value as TypeLiveMode)}
            >
              <SelectItem key="testnet">测试网（默认）</SelectItem>
              <SelectItem key="mainnet">主网（需管理员闸门）</SelectItem>
            </Select>
          </FormField>

          {mode === "mainnet" && enabled && (
            <Callout variant="warning" title="主网交易">
              真实资金存在风险。需 env <code>MAINNET_TRADING_ENABLED=true</code>
              {" "}+ 管理员 token 双重授权。
            </Callout>
          )}

          {accounts.length === 0 ? (
            <div className="text-xs text-text-tertiary">
              尚无账户 —{" "}
              <Link
                href="/accounts/new"
                className="text-brand-primary hover:underline"
              >
                添加账户 →
              </Link>
            </div>
          ) : (
            <FormField label="账户" hint="选择执行该策略的交易所账户">
              <Select
                size="sm"
                aria-label="账户"
                placeholder="选择账户"
                selectedKeys={accountId ? [accountId] : []}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <SelectItem key={a.id}>
                    {`${a.label} · ${a.exchange}`}
                  </SelectItem>
                ))}
              </Select>
            </FormField>
          )}
          {accountId && (
            <Link
              href={`/accounts/${accountId}`}
              className="text-xs text-brand-primary hover:underline"
            >
              查看账户 →
            </Link>
          )}

          <Button
            size="sm"
            color="primary"
            isDisabled={busy}
            isLoading={busy}
            onPress={onSaveLiveClick}
            className="w-full"
          >
            保存实盘配置
          </Button>
        </div>
      </Section>

      <Section title="风控上限">
        <div className="space-y-4 text-sm">
          <FormField label="最大仓位 (USD)" required>
            <Input
              type="number"
              size="sm"
              aria-label="最大仓位 (USD)"
              value={String(maxPosition)}
              onChange={(e) => setMaxPosition(Number(e.target.value))}
            />
          </FormField>
          <FormField label="最大杠杆" required>
            <Input
              type="number"
              size="sm"
              aria-label="最大杠杆"
              value={String(maxLeverage)}
              onChange={(e) => setMaxLeverage(Number(e.target.value))}
            />
          </FormField>
          <FormField label="每日亏损上限 (USD)" required>
            <Input
              type="number"
              size="sm"
              aria-label="每日亏损上限 (USD)"
              value={String(dailyLoss)}
              onChange={(e) => setDailyLoss(Number(e.target.value))}
            />
          </FormField>
          <div className="text-xs text-text-tertiary">
            必填；任一为 0 或缺失会导致 gateway 拒绝所有订单。
          </div>
          <Button
            size="sm"
            color="primary"
            isDisabled={busy}
            isLoading={busy}
            onPress={saveRisk}
            className="w-full"
          >
            保存风控上限
          </Button>
        </div>
      </Section>

      <Section title="危险区">
        <div className="space-y-2 text-sm">
          <div className="text-xs text-text-tertiary">
            删除策略后无法撤销；订单日志与历史回测保留。
          </div>
          <Button
            size="sm"
            color="danger"
            variant="flat"
            onPress={() => setConfirmDelete(true)}
            className="w-full"
          >
            删除策略
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmLive}
        onOpenChange={setConfirmLive}
        title={mode === "mainnet" ? "启用主网交易？" : "保存实盘配置"}
        message={
          mode === "mainnet"
            ? "确认开启主网交易？真实资金存在风险，需服务端闸门同步开启。"
            : "确认开启测试网实盘？"
        }
        confirmLabel="确认启用"
        confirmColor={mode === "mainnet" ? "danger" : "primary"}
        onConfirm={saveLive}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="确认删除策略"
        message={
          <span>
            确认删除策略{" "}
            <span className="font-mono">{strategy.name}</span>?
            此操作不可撤销。策略配置将从 MongoDB 中移除，订单日志保留。
          </span>
        }
        confirmLabel="确认删除"
        confirmColor="danger"
        onConfirm={doDelete}
      />
    </div>
  );
}
