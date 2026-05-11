"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import {
  ApiError,
  TypePortfolioLimits,
  TypeSystemState,
  getPortfolioLimits,
  getSystemState,
  haltTrading,
  resumeTrading,
  setPortfolioLimits,
} from "@/data/api-client";

const ADMIN_KEY_STORAGE = "finance_next_admin_key";

// R2 multi-tenant userId storage key — matches api-client.ts.
// Absent → the gateway falls back to "default" for this browser.
const USER_ID_STORAGE = "finance_next_user_id";

// Phase 7 admin page. Rendered client-side because the operator's admin
// key lives in localStorage; server components have no access. The page
// has three sections: kill switch toggle, portfolio limits editor, and
// a link to the audit viewer.
export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [userId, setUserId] = useState("");
  const [state, setState] = useState<TypeSystemState | null>(null);
  const [limits, setLimits] = useState<TypePortfolioLimits | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [keyStatus, setKeyStatus] = useState<
    "unknown" | "verifying" | "ok" | "bad"
  >("unknown");

  // Load the admin key + userId from localStorage on first paint.
  useEffect(() => {
    const k = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
    const u = window.localStorage.getItem(USER_ID_STORAGE) ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdminKey(k);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserId(u);
  }, []);

  const refresh = async () => {
    if (!adminKey) {
      setKeyStatus("unknown");
      return;
    }
    setKeyStatus("verifying");
    try {
      setError(null);
      const [s, l] = await Promise.all([
        getSystemState(adminKey),
        getPortfolioLimits(adminKey),
      ]);
      setState(s);
      setLimits(l);
      setKeyStatus("ok");
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setKeyStatus("bad");
      } else {
        setKeyStatus("bad");
      }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const onSaveKey = () => {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
    // Immediately re-verify so the halt / limits sections unlock.
    refresh();
  };

  const onSaveUserId = () => {
    if (userId) {
      window.localStorage.setItem(USER_ID_STORAGE, userId);
    } else {
      window.localStorage.removeItem(USER_ID_STORAGE);
    }
    // Reload so every page in the dashboard picks up the new header.
    window.location.reload();
  };

  const onHalt = async () => {
    if (!reason) {
      setError(new Error("必须填写原因"));
      return;
    }
    setBusy(true);
    try {
      const s = await haltTrading(adminKey, reason);
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
      const s = await resumeTrading(adminKey);
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
      const next = await setPortfolioLimits(adminKey, {
        maxOpenNotionalUsd: limits.maxOpenNotionalUsd,
        maxOpenPositionsCount: limits.maxOpenPositionsCount,
        maxDailyLossUsd: limits.maxDailyLossUsd,
      });
      setLimits(next);
    } catch (e) {
      setError(e);
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
        <div className="flex items-center gap-3">
          <button
            className="bg-primary text-white rounded px-3 py-1"
            onClick={onSaveKey}
          >
            保存密钥
          </button>
          {keyStatus === "verifying" && (
            <span className="text-default-500 text-sm">验证中…</span>
          )}
          {keyStatus === "ok" && (
            <span className="text-success text-sm">✓ 已验证</span>
          )}
          {keyStatus === "bad" && (
            <span className="text-danger text-sm">✗ 密钥错误</span>
          )}
        </div>
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
