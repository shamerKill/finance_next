"use client";

// "新建策略" form. Wires the full CreateOptionDto payload through
// POST /api/v1/option. Validation is mostly delegated to the gateway
// validator; the form only enforces non-empty fields client-side so
// the request shape is well-formed.
//
// 2.C.5.b refactor — design-system wraps:
//   - <PageHeader> title block
//   - <FormField label hint> for every input (label always above)
//   - <Callout variant="info"> for the polymarket redirect notice
// Form validation rules, payload shape, and submit logic are untouched.

import { Button, Input, NumberInput, Select, SelectItem, Switch } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FC, FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { createOption } from "@/data/api-client";
import type { TypeOption } from "@/data/type";

type StrategyKind = "grid_dca" | "polymarket_event";

type PositionRow = { marginRate: number; lossAddRate: number };

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

  const isPolymarket = kind === "polymarket_event";

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href="/strategies" className="hover:underline">
            ← 策略
          </Link>
        }
        title="新建策略"
        subtitle="所有字段必填。API 密钥提交后由 gateway 使用 AES-256-GCM 信封加密入库。"
      />

      <ApiErrorView error={error} />

      <Section title="策略类型">
        <FormField label="策略类型" hint="选择策略的执行引擎；不同类型的字段不同">
          <Select
            aria-label="策略类型"
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
        </FormField>

        {isPolymarket && (
          <div className="mt-3">
            <Callout variant="info" title="Polymarket 策略请使用专用页面">
              <p className="mb-2">
                预测市场策略的风控字段与 Grid DCA 不同（maxNotionalUsd /
                maxOpenMarkets / maxSlippageBps / dailyLossCapUsd），
                并需要绑定 Polygon 钱包。请前往专用表单创建。
              </p>
              <Link
                href="/prediction/strategies/new"
                className="text-brand-primary underline"
              >
                前往预测策略创建 →
              </Link>
            </Callout>
          </div>
        )}
      </Section>

      <Section title="基本信息">
        <FormField label="名称" hint="3-8 个字符，必须唯一" required>
          <Input
            aria-label="名称"
            value={name}
            onValueChange={setName}
            isRequired
          />
        </FormField>
      </Section>

      {!isPolymarket && (
        <>
          <Section title="交易参数">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="杠杆倍数" hint="对应交易所的杠杆倍数，1-125" required>
                <NumberInput
                  aria-label="杠杆倍数"
                  value={positionLevel}
                  onValueChange={(v) => setPositionLevel(Number(v))}
                  minValue={1}
                  maxValue={125}
                  isRequired
                />
              </FormField>
              <FormField
                label="未开仓停止时间(分钟)"
                hint="开仓订单挂单未成交时的撤单超时（分钟）"
                required
              >
                <NumberInput
                  aria-label="未开仓停止时间"
                  value={openPositionStopTime}
                  onValueChange={(v) => setOpenPositionStopTime(Number(v))}
                  minValue={1}
                  isRequired
                />
              </FormField>
              <FormField label="交易对" hint="例如 BTCUSDT" required>
                <Input
                  aria-label="交易对"
                  value={execSymbol}
                  onValueChange={setExecSymbol}
                  isRequired
                />
              </FormField>
              <FormField label="订单组保证金" hint="单位 USD" required>
                <NumberInput
                  aria-label="订单组保证金"
                  value={orderGroupMargin}
                  onValueChange={(v) => setOrderGroupMargin(Number(v))}
                  minValue={0}
                  isRequired
                />
              </FormField>
              <FormField label="止盈率" hint="0 ~ 1 之间的比例（例如 0.05 = 5%）" required>
                <NumberInput
                  aria-label="止盈率"
                  value={stopProfitRate}
                  onValueChange={(v) => setStopProfitRate(Number(v))}
                  step={0.01}
                  minValue={0}
                  maxValue={1}
                  isRequired
                />
              </FormField>
              <FormField label="止损率" hint="0 ~ 1 之间的比例（例如 0.05 = 5%）" required>
                <NumberInput
                  aria-label="止损率"
                  value={stopLossRate}
                  onValueChange={(v) => setStopLossRate(Number(v))}
                  step={0.01}
                  minValue={0}
                  maxValue={1}
                  isRequired
                />
              </FormField>
              <FormField
                label="补仓后止盈降低率"
                hint="补仓后将止盈目标向下调整的比例"
                required
              >
                <NumberInput
                  aria-label="补仓后止盈降低率"
                  value={profitRateAfterAtAddPosition}
                  onValueChange={(v) =>
                    setProfitRateAfterAtAddPosition(Number(v))
                  }
                  step={0.01}
                  minValue={0}
                  maxValue={1}
                  isRequired
                />
              </FormField>
              <FormField label="止盈后保本单" hint="止盈后是否自动挂保本单防回吐">
                <div className="flex items-center gap-2 py-2">
                  <Switch
                    isSelected={createCostOrderInProfit}
                    onValueChange={setCreateCostOrderInProfit}
                    aria-label="止盈后保本单"
                  />
                  <span className="text-sm text-text-secondary">
                    {createCostOrderInProfit ? "启用" : "关闭"}
                  </span>
                </div>
              </FormField>
            </div>
          </Section>

          <Section
            title="分批开仓"
            action={
              <Button size="sm" variant="flat" onPress={addRow}>
                添加一行
              </Button>
            }
          >
            <p className="text-xs text-text-tertiary mb-3">
              首行为头仓（lossAddRate = 0），后续行为补仓档位。marginRate
              是该档占订单组总资金的比例。
            </p>
            <div className="space-y-3">
              {positions.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
                >
                  <FormField label={`#${idx + 1} marginRate`}>
                    <NumberInput
                      aria-label={`#${idx + 1} marginRate`}
                      value={row.marginRate}
                      onValueChange={(v) =>
                        patchRow(idx, { marginRate: Number(v) })
                      }
                      step={0.01}
                      minValue={0}
                      maxValue={1}
                    />
                  </FormField>
                  <FormField label={`#${idx + 1} lossAddRate`}>
                    <NumberInput
                      aria-label={`#${idx + 1} lossAddRate`}
                      value={row.lossAddRate}
                      onValueChange={(v) =>
                        patchRow(idx, { lossAddRate: Number(v) })
                      }
                      step={0.01}
                      minValue={0}
                      maxValue={1}
                    />
                  </FormField>
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
          </Section>

          <Section title="交易所凭证">
            <p className="text-xs text-text-tertiary mb-3">
              密钥提交后由 gateway 使用 AES-256-GCM 信封加密入库，
              GET 接口永不返回密钥。
            </p>
            <div className="grid grid-cols-1 gap-4">
              <FormField label="邮箱" required>
                <Input
                  type="email"
                  aria-label="邮箱"
                  value={userEmail}
                  onValueChange={setUserEmail}
                  isRequired
                />
              </FormField>
              <FormField label="API 密钥" required>
                <Input
                  aria-label="API 密钥"
                  value={userApiKey}
                  onValueChange={setUserApiKey}
                  isRequired
                />
              </FormField>
              <FormField label="Secret 密钥" required>
                <PasswordInput
                  aria-label="Secret 密钥"
                  value={userSecretKey}
                  onValueChange={setUserSecretKey}
                  isRequired
                />
              </FormField>
            </div>
          </Section>
        </>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          color="primary"
          isLoading={busy}
          isDisabled={isPolymarket}
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
