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
      setError("reason required");
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
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Admin key</h2>
        <p className="text-sm text-default-500">
          Stored only in this browser&apos;s localStorage; never sent except
          via the X-Admin-Key header to /api/v1/admin/*.
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
          Save key
        </button>
        {error && <div className="text-danger text-sm">{error}</div>}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Kill switch</h2>
        <p className="text-sm">
          Status:{" "}
          <span
            className={
              state?.tradingHalted ? "text-danger font-bold" : "text-success"
            }
          >
            {state?.tradingHalted ? "HALTED" : "ACTIVE"}
          </span>
        </p>
        {state?.tradingHalted ? (
          <div className="space-y-2">
            <p className="text-sm">Reason: {state.haltedReason}</p>
            <button
              className="bg-success text-white rounded px-3 py-1"
              onClick={onResume}
              disabled={busy}
            >
              Resume trading
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="Reason for halt"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="bg-danger text-white rounded px-3 py-1"
              onClick={onHalt}
              disabled={busy || !reason}
            >
              Halt all trading
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Portfolio limits</h2>
        <p className="text-sm text-default-500">
          0 = no cap. Caps apply across all strategies for the default
          user.
        </p>
        {limits && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Max open notional (USD)
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
              Max open positions
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
              Max daily loss (USD)
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
          Save limits
        </button>
      </section>

      <section>
        <h2 className="text-lg font-medium">Audit log</h2>
        <Link className="text-primary underline" href="/admin/audit">
          View recent admin / mutation activity
        </Link>
      </section>
    </div>
  );
}
