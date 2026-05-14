"use client";

// Strategy parameters panel — displays the 8 core grid_dca fields and
// opens an inline editor modal. Saves via PUT /api/v1/option/:id and
// calls router.refresh() so the parent server component picks up the
// new values without a full reload.
//
// The 11-field /option create form is for *new* strategies. This panel
// covers the in-place edit gap that previously forced users to delete
// + recreate when they wanted to tweak a single rate.
//
// 2.C.5.b refactor — Section wrap + FormField inputs in the edit modal.

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  useDisclosure,
} from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { Section } from "@/components/section";
import { useToast } from "@/components/toast";
import { updateOption } from "@/data/api-client";
import type { TypeOption } from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

type Props = { strategy: TypeOption };

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function ParamsPanel({ strategy }: Props) {
  const router = useRouter();
  const toast = useToast();
  const activity = useActivityCenter();
  const id = strategy.id ?? "";

  // Local edit-mode state. Initialised from the strategy on every open;
  // discarded on cancel.
  const [positionLevel, setPositionLevel] = useState(strategy.positionLevel);
  const [execSymbol, setExecSymbol] = useState(strategy.execSymbol);
  const [orderGroupMargin, setOrderGroupMargin] = useState(
    strategy.orderGroupMargin,
  );
  const [stopProfitRate, setStopProfitRate] = useState(strategy.stopProfitRate);
  const [stopLossRate, setStopLossRate] = useState(strategy.stopLossRate);
  const [profitRateAfterAdd, setProfitRateAfterAdd] = useState(
    strategy.profitRateAfterAtAddPosition,
  );
  const [openPositionStopTime, setOpenPositionStopTime] = useState(
    strategy.openPositionStopTime,
  );
  const [createCostOrderInProfit, setCreateCostOrderInProfit] = useState(
    !!strategy.createCostOrderInProfit,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const reset = () => {
    setPositionLevel(strategy.positionLevel);
    setExecSymbol(strategy.execSymbol);
    setOrderGroupMargin(strategy.orderGroupMargin);
    setStopProfitRate(strategy.stopProfitRate);
    setStopLossRate(strategy.stopLossRate);
    setProfitRateAfterAdd(strategy.profitRateAfterAtAddPosition);
    setOpenPositionStopTime(strategy.openPositionStopTime);
    setCreateCostOrderInProfit(!!strategy.createCostOrderInProfit);
    setError(null);
  };

  const onSave = async (close: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await withActivity(
        activity,
        {
          kind: "other",
          label: `更新策略参数 - ${strategy.name}`,
        },
        () =>
          updateOption(id, {
            positionLevel,
            execSymbol,
            orderGroupMargin,
            stopProfitRate,
            stopLossRate,
            profitRateAfterAtAddPosition: profitRateAfterAdd,
            openPositionStopTime,
            createCostOrderInProfit,
          }),
      );
      router.refresh();
      toast.success("策略参数已更新");
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("保存失败", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="策略参数"
      action={
        <button
          type="button"
          onClick={() => {
            reset();
            onOpen();
          }}
          className="text-xs text-brand-primary hover:underline"
        >
          编辑 →
        </button>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Param label="止盈率" value={fmtPct(strategy.stopProfitRate)} />
        <Param label="止损率" value={fmtPct(strategy.stopLossRate)} />
        <Param
          label="补仓后止盈降低"
          value={fmtPct(strategy.profitRateAfterAtAddPosition)}
        />
        <Param label="杠杆" value={`${strategy.positionLevel}x`} />
        <Param
          label="订单组保证金"
          value={`$${strategy.orderGroupMargin}`}
        />
        <Param
          label="未开仓停止时间"
          value={`${strategy.openPositionStopTime} 分钟`}
        />
        <Param label="交易对" value={strategy.execSymbol} />
        <Param
          label="保本单"
          value={strategy.createCostOrderInProfit ? "启用" : "关闭"}
        />
      </dl>

      {strategy.createPositions && strategy.createPositions.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-text-tertiary mb-1">
            分批开仓档位（{strategy.createPositions.length}）
          </div>
          <div className="rounded border border-border-default divide-y divide-border-default text-xs">
            {strategy.createPositions.map((p, i) => (
              <div
                key={i}
                className="flex justify-between px-2 py-1 font-mono tnum"
              >
                <span>#{i + 1}</span>
                <span>marginRate {(p.marginRate * 100).toFixed(1)}%</span>
                <span>lossAddRate {(p.lossAddRate * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-text-tertiary">
        想用 AI 优化这些参数？
        <Link
          href={`/recommendations?strategyId=${id}`}
          className="text-brand-primary hover:underline ml-1"
        >
          查看推荐 →
        </Link>
      </div>

      <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader>编辑策略参数</ModalHeader>
              <ModalBody>
                {error && (
                  <Callout variant="danger" title="保存失败">
                    {error}
                  </Callout>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <FormField label="止盈率" hint="0..1（例 0.05 = 5%）">
                    <Input
                      type="number"
                      aria-label="止盈率"
                      step="0.001"
                      value={String(stopProfitRate)}
                      onChange={(e) =>
                        setStopProfitRate(Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="止损率" hint="0..1">
                    <Input
                      type="number"
                      aria-label="止损率"
                      step="0.001"
                      value={String(stopLossRate)}
                      onChange={(e) =>
                        setStopLossRate(Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="补仓后止盈降低" hint="0..1">
                    <Input
                      type="number"
                      aria-label="补仓后止盈降低"
                      step="0.001"
                      value={String(profitRateAfterAdd)}
                      onChange={(e) =>
                        setProfitRateAfterAdd(Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="杠杆" hint="1..125">
                    <Input
                      type="number"
                      aria-label="杠杆"
                      step="1"
                      value={String(positionLevel)}
                      onChange={(e) =>
                        setPositionLevel(Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="订单组保证金 (USD)">
                    <Input
                      type="number"
                      aria-label="订单组保证金"
                      step="1"
                      value={String(orderGroupMargin)}
                      onChange={(e) =>
                        setOrderGroupMargin(Number(e.target.value))
                      }
                    />
                  </FormField>
                  <FormField label="未开仓停止时间 (分钟)">
                    <Input
                      type="number"
                      aria-label="未开仓停止时间"
                      step="1"
                      value={String(openPositionStopTime)}
                      onChange={(e) =>
                        setOpenPositionStopTime(Number(e.target.value))
                      }
                    />
                  </FormField>
                  <div className="md:col-span-2">
                    <FormField label="交易对" hint="例 BTCUSDT">
                      <Input
                        aria-label="交易对"
                        value={execSymbol}
                        onChange={(e) => setExecSymbol(e.target.value)}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between rounded border border-border-default px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        止盈后创建保本单
                      </div>
                      <div className="text-xs text-text-tertiary">
                        止盈触发后自动挂一个保本单防止回吐
                      </div>
                    </div>
                    <Switch
                      size="sm"
                      isSelected={createCostOrderInProfit}
                      onValueChange={setCreateCostOrderInProfit}
                      aria-label="保本单"
                    />
                  </div>
                </div>
                <div className="mt-3 text-xs text-text-tertiary">
                  注：分批开仓档位（createPositions）目前不支持在此面板中编辑，
                  请通过 AI 推荐审批流或重新创建策略调整。
                </div>
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="flat" onPress={close}>
                  取消
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isLoading={busy}
                  onPress={() => onSave(close)}
                >
                  保存
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Section>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="font-mono tnum text-right text-text-primary">{value}</dd>
    </>
  );
}
