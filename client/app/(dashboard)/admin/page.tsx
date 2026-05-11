"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  TypePortfolioLimits,
  TypeSystemState,
  getPortfolioLimits,
  getSystemState,
  haltTrading,
  resumeTrading,
  setPortfolioLimits,
} from "@/data/api-client";

const ADMIN_KEY_STORAGE = "finance_next_admin_key";

// Phase 7 admin page. Rendered client-side because the operator's admin
// key lives in localStorage; server components have no access. The page
// has three sections: kill switch toggle, portfolio limits editor, and
// a link to the audit viewer.
export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [state, setState] = useState<TypeSystemState | null>(null);
  const [limits, setLimits] = useState<TypePortfolioLimits | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the admin key from localStorage on first paint.
  useEffect(() => {
    const k = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdminKey(k);
  }, []);

  const refresh = async () => {
    if (!adminKey) return;
    try {
      setError(null);
      const [s, l] = await Promise.all([
        getSystemState(adminKey),
        getPortfolioLimits(adminKey),
      ]);
      setState(s);
      setLimits(l);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const onSaveKey = () => {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
    refresh();
  };

  const onHalt = async () => {
    if (!reason) {
      setError("必须填写原因");
      return;
    }
    setBusy(true);
    try {
      const s = await haltTrading(adminKey, reason);
      setState(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onResume = async () => {
    setBusy(true);
    try {
      const s = await resumeTrading(adminKey);
      setState(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSaveLimits = async () => {
    if (!limits) return;
    setBusy(true);
    try {
      const next = await setPortfolioLimits(adminKey, {
        maxOpenNotionalUsd: limits.maxOpenNotionalUsd,
        maxOpenPositionsCount: limits.maxOpenPositionsCount,
        maxDailyLossUsd: limits.maxDailyLossUsd,
      });
      setLimits(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">管理</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">管理密钥</h2>
        <p className="text-sm text-default-500">
          仅保存在本浏览器的 localStorage 中；除了通过 X-Admin-Key
          请求头发送到 /api/v1/admin/* 外，不会传输到任何其他地方。
        </p>
        <input
          className="border rounded px-2 py-1 w-full font-mono"
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
        />
        <button
          className="bg-primary text-white rounded px-3 py-1"
          onClick={onSaveKey}
        >
          保存密钥
        </button>
        {error && <div className="text-danger text-sm">{error}</div>}
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

      <section>
        <h2 className="text-lg font-medium">审计日志</h2>
        <Link className="text-primary underline" href="/admin/audit">
          查看最近的管理 / 变更操作
        </Link>
      </section>
    </div>
  );
}
