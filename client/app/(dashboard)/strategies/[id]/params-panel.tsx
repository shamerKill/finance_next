"use client";

// Strategy parameters panel — displays the 8 core grid_dca fields and
// opens an inline editor modal. Saves via PUT /api/v1/option/:id and
// calls router.refresh() so the parent server component picks up the
// new values without a full reload.
//
// The 11-field /option create form is for *new* strategies. This panel
// covers the in-place edit gap that previously forced users to delete
// + recreate when they wanted to tweak a single rate.

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

import { Section } from "@/components/section";
import { updateOption } from "@/data/api-client";
import type { TypeOption } from "@/data/type";

type Props = { strategy: TypeOption };

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function ParamsPanel({ strategy }: Props) {
  const router = useRouter();
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
      await updateOption(id, {
        positionLevel,
        execSymbol,
        orderGroupMargin,
        stopProfitRate,
        stopLossRate,
        profitRateAfterAtAddPosition: profitRateAfterAdd,
        openPositionStopTime,
        createCostOrderInProfit,
      });
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
          className="text-xs text-primary hover:underline"
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
          <div className="text-xs text-default-500 mb-1">
            分批开仓档位（{strategy.createPositions.length}）
          </div>
          <div className="rounded border border-default-200 divide-y divide-default-200 text-xs">
            {strategy.createPositions.map((p, i) => (
              <div
                key={i}
                className="flex justify-between px-2 py-1 font-mono"
              >
                <span>#{i + 1}</span>
                <span>marginRate {(p.marginRate * 100).toFixed(1)}%</span>
                <span>lossAddRate {(p.lossAddRate * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-default-400">
        想用 AI 优化这些参数？
        <Link
          href={`/recommendations?strategyId=${id}`}
          className="text-primary hover:underline ml-1"
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
                  <div className="rounded border border-danger-200 bg-danger-50 p-2 text-xs text-danger-700 mb-3">
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Input
                    type="number"
                    label="止盈率"
                    description="0..1（例 0.05 = 5%）"
                    step="0.001"
                    value={String(stopProfitRate)}
                    onChange={(e) => setStopProfitRate(Number(e.target.value))}
                  />
                  <Input
                    type="number"
                    label="止损率"
                    description="0..1"
                    step="0.001"
                    value={String(stopLossRate)}
                    onChange={(e) => setStopLossRate(Number(e.target.value))}
                  />
                  <Input
                    type="number"
                    label="补仓后止盈降低"
                    description="0..1"
                    step="0.001"
                    value={String(profitRateAfterAdd)}
                    onChange={(e) =>
                      setProfitRateAfterAdd(Number(e.target.value))
                    }
                  />
                  <Input
                    type="number"
                    label="杠杆"
                    description="1..125"
                    step="1"
                    value={String(positionLevel)}
                    onChange={(e) => setPositionLevel(Number(e.target.value))}
                  />
                  <Input
                    type="number"
                    label="订单组保证金 (USD)"
                    step="1"
                    value={String(orderGroupMargin)}
                    onChange={(e) =>
                      setOrderGroupMargin(Number(e.target.value))
                    }
                  />
                  <Input
                    type="number"
                    label="未开仓停止时间 (分钟)"
                    step="1"
                    value={String(openPositionStopTime)}
                    onChange={(e) =>
                      setOpenPositionStopTime(Number(e.target.value))
                    }
                  />
                  <Input
                    label="交易对"
                    description="例 BTCUSDT"
                    value={execSymbol}
                    onChange={(e) => setExecSymbol(e.target.value)}
                    className="col-span-2"
                  />
                  <div className="col-span-2 flex items-center justify-between rounded border border-default-200 px-3 py-2">
                    <div>
                      <div className="text-sm">止盈后创建保本单</div>
                      <div className="text-xs text-default-500">
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
                <div className="mt-3 text-xs text-default-500">
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
      <dt className="text-default-500">{label}</dt>
      <dd className="font-mono text-right">{value}</dd>
    </>
  );
}
