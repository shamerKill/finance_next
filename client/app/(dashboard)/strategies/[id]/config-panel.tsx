"use client";

// Client island for the left-column config panel: live toggle, mode
// select, account picker, risk caps, and the danger-zone delete button.
// Each mutation calls router.refresh() on success so the server-rendered
// performance cards re-fetch with the new state instead of going stale.

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  useDisclosure,
} from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Section } from "@/components/section";
import { deleteOption, setLive, setRisk } from "@/data/api-client";
import type { TypeAccount, TypeLiveMode, TypeOption } from "@/data/type";

type Props = {
  strategy: TypeOption;
  accounts: TypeAccount[];
};

export function ConfigPanel({ strategy, accounts }: Props) {
  const router = useRouter();
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
  const [deleting, setDeleting] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const onSaveLive = async () => {
    setBusy(true);
    setError(null);
    try {
      await setLive(id, { enabled, mode, accountId });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSaveRisk = async () => {
    setBusy(true);
    setError(null);
    try {
      await setRisk(id, {
        maxPositionUsd: maxPosition,
        maxLeverage,
        dailyLossCapUsd: dailyLoss,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteOption(id);
      // Navigate back to the strategies list; refresh() alone would
      // 404 on the now-deleted detail route.
      router.push("/strategies");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
          {error}
        </div>
      )}

      <Section title="实盘控制">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>启用实盘</span>
            <Switch
              size="sm"
              isSelected={enabled}
              onValueChange={setEnabled}
              aria-label="启用实盘"
            />
          </div>
          <Select
            label="模式"
            size="sm"
            selectedKeys={[mode]}
            onChange={(e) => setMode(e.target.value as TypeLiveMode)}
          >
            <SelectItem key="testnet">测试网（默认）</SelectItem>
            <SelectItem key="mainnet">主网（需管理员闸门）</SelectItem>
          </Select>
          {accounts.length === 0 ? (
            <div className="text-xs text-default-500">
              尚无账户 —{" "}
              <Link
                href="/accounts/new"
                className="text-primary hover:underline"
              >
                添加账户 →
              </Link>
            </div>
          ) : (
            <Select
              label="账户"
              size="sm"
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
          )}
          <Button
            size="sm"
            color="primary"
            isDisabled={busy}
            isLoading={busy}
            onPress={onSaveLive}
            className="w-full"
          >
            保存实盘配置
          </Button>
        </div>
      </Section>

      <Section title="风控上限">
        <div className="space-y-3 text-sm">
          <Input
            type="number"
            label="最大仓位 (USD)"
            size="sm"
            value={String(maxPosition)}
            onChange={(e) => setMaxPosition(Number(e.target.value))}
          />
          <Input
            type="number"
            label="最大杠杆"
            size="sm"
            value={String(maxLeverage)}
            onChange={(e) => setMaxLeverage(Number(e.target.value))}
          />
          <Input
            type="number"
            label="每日亏损上限 (USD)"
            size="sm"
            value={String(dailyLoss)}
            onChange={(e) => setDailyLoss(Number(e.target.value))}
          />
          <div className="text-[11px] text-default-500">
            必填；任一为 0 或缺失会导致 gateway 拒绝所有订单。
          </div>
          <Button
            size="sm"
            color="primary"
            isDisabled={busy}
            isLoading={busy}
            onPress={onSaveRisk}
            className="w-full"
          >
            保存风控上限
          </Button>
        </div>
      </Section>

      <Section title="危险区">
        <div className="space-y-2 text-sm">
          <div className="text-xs text-default-500">
            删除策略后无法撤销；订单日志与历史回测保留。
          </div>
          <Button
            size="sm"
            color="danger"
            variant="flat"
            onPress={onOpen}
            className="w-full"
          >
            删除策略
          </Button>
        </div>
      </Section>

      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader>确认删除策略</ModalHeader>
              <ModalBody>
                <p className="text-sm">
                  确认删除策略 <span className="font-mono">{strategy.name}</span> ？
                </p>
                <p className="text-xs text-default-500">
                  此操作不可撤销。策略配置将从 MongoDB 中移除，订单日志保留。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="flat" onPress={close}>
                  取消
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  isLoading={deleting}
                  onPress={onConfirmDelete}
                >
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
