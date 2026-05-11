"use client";

import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Switch,
  Tooltip,
} from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FC, FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { createOption } from "@/data/api-client";
import type { TypeOption } from "@/data/type";

type StrategyKind = "grid_dca" | "polymarket_event";

type PositionRow = { marginRate: number; lossAddRate: number };

// "新建策略" form. Wires the full CreateOptionDto payload through
// POST /api/v1/option. Validation is mostly delegated to the gateway
// validator; the form only enforces non-empty fields client-side so
// the request shape is well-formed.
const NewStrategyPage: FC = () => {
  const router = useRouter();
  const [kind, setKind] = useState<StrategyKind>("grid_dca");
  const [name, setName] = useState("");
  const [positionLevel, setPositionLevel] = useState<number>(5);
  const [openPositionStopTime, setOpenPositionStopTime] = useState<number>(30);
  const [execSymbol, setExecSymbol] = useState("BTCUSDT");
  const [orderGroupMargin, setOrderGroupMargin] = useState<number>(100);
  const [stopProfitRate, setStopProfitRate] = useState<number>(0.05);
  const [stopLossRate, setStopLossRate] = useState<number>(0.05);
  const [profitRateAfterAtAddPosition, setProfitRateAfterAtAddPosition] =
    useState<number>(0.02);
  const [createCostOrderInProfit, setCreateCostOrderInProfit] = useState(false);
  const [positions, setPositions] = useState<PositionRow[]>([
    { marginRate: 1, lossAddRate: 0 },
  ]);
  const [userEmail, setUserEmail] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userSecretKey, setUserSecretKey] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const addRow = () =>
    setPositions((rows) => [...rows, { marginRate: 0, lossAddRate: 0 }]);
  const removeRow = (idx: number) =>
    setPositions((rows) => rows.filter((_, i) => i !== idx));
  const patchRow = (idx: number, patch: Partial<PositionRow>) =>
    setPositions((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload: TypeOption = {
        name,
        positionLevel,
        openPositionStopTime,
        execSymbol,
        orderGroupMargin,
        stopProfitRate,
        stopLossRate,
        profitRateAfterAtAddPosition,
        createCostOrderInProfit,
        createPositions: positions,
        userEmail,
        userApiKey,
        userSecretKey,
      };
      await createOption(payload);
      router.push("/strategies");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">新建策略</h1>
      <p className="text-sm text-default-500">
        所有字段必填。API 密钥提交后由 gateway 使用 AES-256-GCM 信封加密入库。
      </p>

      <ApiErrorView error={error} />

      <Select
        label="策略类型"
        description="选择策略的执行引擎；不同类型的字段不同"
        selectedKeys={[kind]}
        onSelectionChange={(keys) => {
          const k = Array.from(keys)[0] as StrategyKind | undefined;
          if (k) setKind(k);
        }}
      >
        <SelectItem key="grid_dca">Grid DCA（网格定投）</SelectItem>
        <SelectItem key="polymarket_event">
          Polymarket Event（预测市场）
        </SelectItem>
      </Select>

      {kind === "polymarket_event" ? (
        <Callout variant="info" title="Polymarket 策略请使用专用页面">
          <p className="mb-2">
            预测市场策略的风控字段与 Grid DCA 不同（maxNotionalUsd /
            maxOpenMarkets / maxSlippageBps / dailyLossCapUsd），
            并需要绑定 Polygon 钱包。请前往专用表单创建。
          </p>
          <Link
            href="/prediction/strategies/new"
            className="text-primary underline"
          >
            前往预测策略创建 →
          </Link>
        </Callout>
      ) : null}

      <Input
        label="名称"
        description="3-8 个字符，必须唯一"
        value={name}
        onValueChange={setName}
        isRequired
      />

      <div
        className="grid grid-cols-2 gap-3"
        style={{ display: kind === "polymarket_event" ? "none" : undefined }}
      >
        <Tooltip content="对应交易所的杠杆倍数，1-125">
          <NumberInput
            label="杠杆倍数"
            value={positionLevel}
            onValueChange={(v) => setPositionLevel(Number(v))}
            minValue={1}
            maxValue={125}
            isRequired
          />
        </Tooltip>
        <Tooltip content="开仓订单挂单未成交时的撤单超时（分钟）">
          <NumberInput
            label="未开仓停止时间(分钟)"
            value={openPositionStopTime}
            onValueChange={(v) => setOpenPositionStopTime(Number(v))}
            minValue={1}
            isRequired
          />
        </Tooltip>
        <Input
          label="交易对"
          description="例如 BTCUSDT"
          value={execSymbol}
          onValueChange={setExecSymbol}
          isRequired
        />
        <NumberInput
          label="订单组保证金"
          value={orderGroupMargin}
          onValueChange={(v) => setOrderGroupMargin(Number(v))}
          minValue={0}
          isRequired
        />
        <Tooltip content="0 ~ 1 之间的比例（例如 0.05 = 5%）">
          <NumberInput
            label="止盈率"
            value={stopProfitRate}
            onValueChange={(v) => setStopProfitRate(Number(v))}
            step={0.01}
            minValue={0}
            maxValue={1}
            isRequired
          />
        </Tooltip>
        <Tooltip content="0 ~ 1 之间的比例（例如 0.05 = 5%）">
          <NumberInput
            label="止损率"
            value={stopLossRate}
            onValueChange={(v) => setStopLossRate(Number(v))}
            step={0.01}
            minValue={0}
            maxValue={1}
            isRequired
          />
        </Tooltip>
        <Tooltip content="补仓后将止盈目标向下调整的比例">
          <NumberInput
            label="补仓后止盈降低率"
            value={profitRateAfterAtAddPosition}
            onValueChange={(v) =>
              setProfitRateAfterAtAddPosition(Number(v))
            }
            step={0.01}
            minValue={0}
            maxValue={1}
            isRequired
          />
        </Tooltip>
        <div className="flex items-center gap-2">
          <Switch
            isSelected={createCostOrderInProfit}
            onValueChange={setCreateCostOrderInProfit}
          >
            止盈后保本单
          </Switch>
        </div>
      </div>

      <div
        className="space-y-2"
        style={{ display: kind === "polymarket_event" ? "none" : undefined }}
      >
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">分批开仓</label>
          <Button size="sm" variant="flat" onPress={addRow}>
            添加一行
          </Button>
        </div>
        <p className="text-xs text-default-500">
          首行为头仓（lossAddRate = 0），后续行为补仓档位。marginRate 是该档
          占订单组总资金的比例。
        </p>
        {positions.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <NumberInput
              label={`#${idx + 1} marginRate`}
              value={row.marginRate}
              onValueChange={(v) =>
                patchRow(idx, { marginRate: Number(v) })
              }
              step={0.01}
              minValue={0}
              maxValue={1}
            />
            <NumberInput
              label={`#${idx + 1} lossAddRate`}
              value={row.lossAddRate}
              onValueChange={(v) =>
                patchRow(idx, { lossAddRate: Number(v) })
              }
              step={0.01}
              minValue={0}
              maxValue={1}
            />
            <Button
              size="sm"
              variant="flat"
              color="danger"
              isDisabled={positions.length <= 1}
              onPress={() => removeRow(idx)}
            >
              删除
            </Button>
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-1 gap-3"
        style={{ display: kind === "polymarket_event" ? "none" : undefined }}
      >
        <Input
          label="邮箱"
          type="email"
          value={userEmail}
          onValueChange={setUserEmail}
          isRequired
        />
        <Input
          label="API 密钥"
          value={userApiKey}
          onValueChange={setUserApiKey}
          isRequired
        />
        <Input
          label="Secret 密钥"
          type="password"
          value={userSecretKey}
          onValueChange={setUserSecretKey}
          isRequired
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          color="primary"
          isLoading={busy}
          isDisabled={kind === "polymarket_event"}
        >
          创建策略
        </Button>
        <Button variant="flat" onPress={() => router.push("/strategies")}>
          取消
        </Button>
      </div>
    </form>
  );
};

export default NewStrategyPage;
