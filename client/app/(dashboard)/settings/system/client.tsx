"use client";

// Node 3.E.1 — operator-facing system settings.
//
// 双 key 模式收口后：admin 鉴权完全走 JWT cookie role=admin（apiFetch
// 自动转发），不再有 admin key 输入框或 localStorage adminKey。
// 这里还保留多租户 X-User-Id 的 localStorage 入口（dev 用），但不再
// 与 admin 鉴权有关。
//
// Sections:
//   * 多租户 userId localStorage 编辑器（dev helper）
//   * Kill switch (halt / resume — writes system_state.tradingHalted)
//   * Portfolio limits form (PUT /api/v1/admin/portfolio-limits)
//
// Audit log lives under /settings/observability (per spec §G3 IA).

import { useEffect, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import {
  TypePortfolioLimits,
  TypeSystemState,
  getPortfolioLimits,
  getSystemState,
  haltTrading,
  resumeTrading,
  setPortfolioLimits,
} from "@/data/api-client";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

// R2 multi-tenant userId storage key — matches api-client.ts.
// Absent → the gateway falls back to "default" for this browser.
const USER_ID_STORAGE = "finance_next_user_id";

export function SystemSettingsClient() {
  const activity = useActivityCenter();
  const [userId, setUserId] = useState("");
  const [state, setState] = useState<TypeSystemState | null>(null);
  const [limits, setLimits] = useState<TypePortfolioLimits | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = window.localStorage.getItem(USER_ID_STORAGE) ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserId(u);
  }, []);

  const refresh = async () => {
    try {
      setError(null);
      const [s, l] = await Promise.all([
        getSystemState(),
        getPortfolioLimits(),
      ]);
      setState(s);
      setLimits(l);
    } catch (e) {
      setError(e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const onSaveUserId = () => {
    if (userId) {
      window.localStorage.setItem(USER_ID_STORAGE, userId);
    } else {
      window.localStorage.removeItem(USER_ID_STORAGE);
    }
    window.location.reload();
  };

  const onHalt = async () => {
    if (!reason) {
      setError(new Error("必须填写原因"));
      return;
    }
    setBusy(true);
    try {
      const s = await withActivity(
        activity,
        { kind: "other", label: "紧急停机", detail: reason },
        () => haltTrading(reason),
      );
      setState(s);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const onResume = async () => {
    setBusy(true);
    try {
      const s = await withActivity(
        activity,
        { kind: "other", label: "恢复交易" },
        () => resumeTrading(),
      );
      setState(s);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const onSaveLimits = async () => {
    if (!limits) return;
    setBusy(true);
    try {
      const next = await withActivity(
        activity,
        {
          kind: "other",
          label: "更新组合限额",
          detail: `notional $${limits.maxOpenNotionalUsd} · positions ${limits.maxOpenPositionsCount} · daily $${limits.maxDailyLossUsd}`,
        },
        () =>
          setPortfolioLimits({
            maxOpenNotionalUsd: limits.maxOpenNotionalUsd,
            maxOpenPositionsCount: limits.maxOpenPositionsCount,
            maxDailyLossUsd: limits.maxDailyLossUsd,
          }),
      );
      setLimits(next);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">系统</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">管理员鉴权</h2>
        <p className="text-sm text-default-500">
          所有 admin 操作通过登录 cookie（role=admin）授权。如果本页加载
          失败 / 403，请用 admin 账号重新登录。原 `X-Admin-Key` 输入框已
          移除，env `ADMIN_KEY` 仍保留作为 s2s / CI / curl 后向兼容路径。
        </p>
        <ApiErrorView error={error} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">用户 ID（X-User-Id）</h2>
        <p className="text-sm text-default-500">
          多租户开发开关：留空则网关回落到默认用户 &quot;default&quot;。
          仅保存到本浏览器的 localStorage，并通过 X-User-Id
          请求头发送到 /api/v1/*。未来由认证代理在边缘验证后注入。
        </p>
        <input
          className="border rounded px-2 py-1 w-full font-mono"
          type="text"
          placeholder="留空 = default"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button
          className="bg-primary text-white rounded px-3 py-1"
          onClick={onSaveUserId}
        >
          保存并刷新
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">紧急停机开关</h2>
        <p className="text-sm">
          状态：{" "}
          <span
            className={
              state?.tradingHalted ? "text-danger font-bold" : "text-success"
            }
          >
            {state?.tradingHalted ? "已暂停" : "运行中"}
          </span>
        </p>
        {state?.tradingHalted ? (
          <div className="space-y-2">
            <p className="text-sm">原因：{state.haltedReason}</p>
            <button
              className="bg-success text-white rounded px-3 py-1"
              onClick={onResume}
              disabled={busy}
            >
              恢复交易
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="暂停原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="bg-danger text-white rounded px-3 py-1"
              onClick={onHalt}
              disabled={busy || !reason}
            >
              暂停所有交易
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">投资组合限额</h2>
        <p className="text-sm text-default-500">
          0 表示无上限。限额适用于默认用户的所有策略。
        </p>
        {limits && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              最大未平仓名义金额（USD）
              <input
                className="border rounded px-2 py-1 w-full"
                type="number"
                min={0}
                step={100}
                value={limits.maxOpenNotionalUsd}
                onChange={(e) =>
                  setLimits({
                    ...limits,
                    maxOpenNotionalUsd: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="text-sm">
              最大持仓数量
              <input
                className="border rounded px-2 py-1 w-full"
                type="number"
                min={0}
                step={1}
                value={limits.maxOpenPositionsCount}
                onChange={(e) =>
                  setLimits({
                    ...limits,
                    maxOpenPositionsCount: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="text-sm col-span-2">
              每日最大亏损（USD）
              <input
                className="border rounded px-2 py-1 w-full"
                type="number"
                min={0}
                step={100}
                value={limits.maxDailyLossUsd}
                onChange={(e) =>
                  setLimits({
                    ...limits,
                    maxDailyLossUsd: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        <button
          className="bg-primary text-white rounded px-3 py-1"
          onClick={onSaveLimits}
          disabled={busy || !limits}
        >
          保存限额
        </button>
      </section>
    </div>
  );
}
