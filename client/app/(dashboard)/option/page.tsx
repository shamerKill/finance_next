"use client";

// "新建策略" form. Wires the full CreateOptionDto payload through
// POST /api/v1/option. Validation is mostly delegated to the gateway
// validator; manual creation still asks for credentials client-side,
// while AI-prefilled drafts can be saved first and bound to an account later.
//
// 2.C.5.b refactor — design-system wraps:
//   - <PageHeader> title block
//   - <FormField label hint> for every input (label always above)
//   - <Callout variant="info"> for the polymarket redirect notice
// Credential fields are intentionally optional for AI drafts: live execution
// still requires a bound account through the strategy detail page.

import { Button, Input, NumberInput, Select, SelectItem, Switch } from "@heroui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FC, FormEvent, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { Callout } from "@/components/callout";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-field";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { createOption, updateAIGoalRunAction } from "@/data/api-client";
import {
  optionCreateRedirectHref,
  parseStrategyPreset,
  strategyActionPatchFromOptionPresetCreate,
} from "@/data/ai-goal-preset.mjs";
import type {
  TypeAIGoalRunActionPatch,
  TypeCreateOptionResponse,
  TypeOption,
} from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

type StrategyKind = "grid_dca" | "polymarket_event";

type PositionRow = { marginRate: number; lossAddRate: number };

const NewStrategyPage: FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activity = useActivityCenter();
  const aiPreset = parseStrategyPreset(searchParams);
  const [kind, setKind] = useState<StrategyKind>(aiPreset.kind as StrategyKind);
  const [name, setName] = useState(aiPreset.name);
  const [positionLevel, setPositionLevel] = useState<number>(aiPreset.positionLevel);
  const [openPositionStopTime, setOpenPositionStopTime] = useState<number>(
    aiPreset.openPositionStopTime,
  );
  const [execSymbol, setExecSymbol] = useState(aiPreset.execSymbol);
  const [orderGroupMargin, setOrderGroupMargin] = useState<number>(
    aiPreset.orderGroupMargin,
  );
  const [stopProfitRate, setStopProfitRate] = useState<number>(aiPreset.stopProfitRate);
  const [stopLossRate, setStopLossRate] = useState<number>(aiPreset.stopLossRate);
  const [profitRateAfterAtAddPosition, setProfitRateAfterAtAddPosition] =
    useState<number>(aiPreset.profitRateAfterAtAddPosition);
  const [createCostOrderInProfit, setCreateCostOrderInProfit] = useState(
    aiPreset.createCostOrderInProfit,
  );
  const [positions, setPositions] = useState<PositionRow[]>(aiPreset.createPositions);
  const [riskMaxPositionUsd, setRiskMaxPositionUsd] = useState<number>(
    aiPreset.risk?.maxPositionUsd ?? 0,
  );
  const [riskMaxLeverage, setRiskMaxLeverage] = useState<number>(
    aiPreset.risk?.maxLeverage ?? 0,
  );
  const [riskDailyLossCapUsd, setRiskDailyLossCapUsd] = useState<number>(
    aiPreset.risk?.dailyLossCapUsd ?? 0,
  );
  const [userEmail, setUserEmail] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userSecretKey, setUserSecretKey] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const credentialRequired = !aiPreset.isPreset;
  const redirectAfterCreate = optionCreateRedirectHref as unknown as (input: {
    isAIPreset: boolean;
    response: TypeCreateOptionResponse;
    runId?: string;
  }) => string;
  const buildStrategyActionHandoff =
    strategyActionPatchFromOptionPresetCreate as unknown as (input: {
      preset: typeof aiPreset;
      response: TypeCreateOptionResponse;
      href: string;
    }) => {
      runId: string;
      actionId: string;
      patch: TypeAIGoalRunActionPatch;
    } | null;

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
      const risk =
        riskMaxPositionUsd > 0 && riskMaxLeverage > 0 && riskDailyLossCapUsd > 0
          ? {
              maxPositionUsd: riskMaxPositionUsd,
              maxLeverage: riskMaxLeverage,
              dailyLossCapUsd: riskDailyLossCapUsd,
            }
          : undefined;
      const credentialPatch: Pick<TypeOption, "userEmail" | "userApiKey" | "userSecretKey"> = {};
      if (userEmail.trim()) credentialPatch.userEmail = userEmail.trim();
      if (userApiKey.trim()) credentialPatch.userApiKey = userApiKey.trim();
      if (userSecretKey.trim()) credentialPatch.userSecretKey = userSecretKey.trim();
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
        ...credentialPatch,
        ...(aiPreset.aiRunId ? { aiRunId: aiPreset.aiRunId } : {}),
        ...(risk ? { risk } : {}),
      };
      const response = await withActivity(
        activity,
        {
          kind: "other",
          label: `新建策略 - ${name || "未命名"}`,
          detail: execSymbol,
        },
        () => createOption(payload),
      );
      const href = redirectAfterCreate({
        isAIPreset: aiPreset.isPreset,
        response,
        runId: aiPreset.aiRunId,
      });
      const handoff = buildStrategyActionHandoff({
        preset: aiPreset,
        response,
        href,
      });
      if (handoff) {
        try {
          await updateAIGoalRunAction(
            handoff.runId,
            handoff.actionId,
            handoff.patch,
          );
        } catch (handoffErr) {
          console.warn("AI 运行记忆同步失败，已继续打开新策略详情。", handoffErr);
        }
      }
      router.push(href);
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
        subtitle={
          aiPreset.isPreset
            ? "AI 草案可以先保存为策略配置；交易所账户稍后在策略详情中绑定，保存本身不会下单。"
            : "手工创建策略时请填写交易所凭证。API 密钥提交后由 gateway 使用 AES-256-GCM 信封加密入库。"
        }
      />

      <ApiErrorView error={error} />

      {aiPreset.isPreset && (
        <Callout variant="info" title="已从 AI 策略蓝图预填">
          参数来自 AI 目标分析，只用于加速建草案。你可以先保存配置并继续观察；
          交易所凭证可稍后通过账户/策略 live 设置绑定。
        </Callout>
      )}

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

          <Section title="风控上限">
            <p className="text-xs text-text-tertiary mb-3">
              live/testnet 下单前会读取这些上限；任一项为空时，后续真实下单会被风控拒绝。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="最大单次仓位" hint="单位 USD；限制单次提交 notional">
                <NumberInput
                  aria-label="最大单次仓位"
                  value={riskMaxPositionUsd}
                  onValueChange={(v) => setRiskMaxPositionUsd(Number(v))}
                  minValue={0}
                />
              </FormField>
              <FormField label="最大杠杆" hint="账户维度杠杆上限">
                <NumberInput
                  aria-label="最大杠杆"
                  value={riskMaxLeverage}
                  onValueChange={(v) => setRiskMaxLeverage(Number(v))}
                  minValue={0}
                  maxValue={125}
                />
              </FormField>
              <FormField label="日亏损上限" hint="单位 USD；触发后停止提交">
                <NumberInput
                  aria-label="日亏损上限"
                  value={riskDailyLossCapUsd}
                  onValueChange={(v) => setRiskDailyLossCapUsd(Number(v))}
                  minValue={0}
                />
              </FormField>
            </div>
          </Section>

          <Section title="交易所凭证">
            <p className="text-xs text-text-tertiary mb-3">
              {credentialRequired
                ? "密钥提交后由 gateway 使用 AES-256-GCM 信封加密入库，GET 接口永不返回密钥。"
                : "AI 草案保存时可以不填密钥；后续进入测试网或实盘前，仍需绑定只读/可交易但不可提现的账户。"}
            </p>
            <div className="grid grid-cols-1 gap-4">
              <FormField label="邮箱" required={credentialRequired}>
                <Input
                  type="email"
                  aria-label="邮箱"
                  value={userEmail}
                  onValueChange={setUserEmail}
                  isRequired={credentialRequired}
                />
              </FormField>
              <FormField label="API 密钥" required={credentialRequired}>
                <Input
                  aria-label="API 密钥"
                  value={userApiKey}
                  onValueChange={setUserApiKey}
                  isRequired={credentialRequired}
                />
              </FormField>
              <FormField label="Secret 密钥" required={credentialRequired}>
                <PasswordInput
                  aria-label="Secret 密钥"
                  value={userSecretKey}
                  onValueChange={setUserSecretKey}
                  isRequired={credentialRequired}
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
          {aiPreset.isPreset ? "保存 AI 草案" : "创建策略"}
        </Button>
        <Button variant="flat" onPress={() => router.push("/strategies")}>
          取消
        </Button>
      </div>
    </form>
  );
};

export default NewStrategyPage;
