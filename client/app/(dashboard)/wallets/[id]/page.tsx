"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  approveWallet,
  getWallet,
  getWalletBalance,
  getWalletPositions,
} from "@/data/api-client";
import {
  TypeWallet,
  TypeWalletBalance,
  TypeWalletPosition,
} from "@/data/type";

export default function WalletDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [wallet, setWallet] = useState<TypeWallet | null>(null);
  const [balance, setBalance] = useState<TypeWalletBalance | null>(null);
  const [positions, setPositions] = useState<TypeWalletPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approveAmt, setApproveAmt] = useState("");
  const [approveStatus, setApproveStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const w = await getWallet(id);
        if (!cancel) setWallet(w);
        const b = await getWalletBalance(id).catch(() => null);
        if (!cancel) setBalance(b);
        const p = await getWalletPositions(id).catch(() => []);
        if (!cancel) setPositions(p);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [id]);

  const approve = async () => {
    setApproveStatus(null);
    const adminKey = window.localStorage.getItem("finance_next_admin_key");
    if (!adminKey) {
      setApproveStatus("localStorage 中未设置 admin key");
      return;
    }
    const amt = parseFloat(approveAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      setApproveStatus("金额必须 > 0");
      return;
    }
    try {
      const res = await approveWallet(id, adminKey, amt);
      setApproveStatus(`已授权 $${res.amountApproved.toFixed(2)} — tx ${res.txHash}`);
      const b = await getWalletBalance(id).catch(() => null);
      setBalance(b);
    } catch (e) {
      setApproveStatus(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) {
    return (
      <div className="rounded border border-danger p-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!wallet) {
    return <div className="text-sm text-default-500">加载中…</div>;
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{wallet.label}</h1>
      <div className="text-xs text-default-500 font-mono">
        {wallet.address}
      </div>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">USDC 余额 + 授权额度</h2>
        {balance ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>余额：${balance.balanceUsdc.toFixed(2)}</div>
            <div>授权额度：${balance.allowanceUsdc.toFixed(2)}</div>
          </div>
        ) : (
          <div className="text-sm text-default-500">
            Polygon RPC 未配置或余额获取失败。
          </div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">USDC 限额授权（管理员）</h2>
        <div className="text-xs text-default-500 mb-2">
          授权额度受{" "}
          <code>portfolio_limits.maxOpenNotionalUsd</code> 硬性限制。
          无限额度授权在设计上不可能。需要 admin key。
        </div>
        <div className="flex gap-2 items-end">
          <label className="text-sm flex flex-col gap-1">
            <span>金额（USDC）</span>
            <input
              type="number"
              step="0.01"
              value={approveAmt}
              onChange={(e) => setApproveAmt(e.target.value)}
              className="border border-default-200 rounded px-2 py-1 w-40"
            />
          </label>
          <button
            type="button"
            onClick={approve}
            className="px-3 py-2 rounded bg-warning text-white text-sm"
          >
            授权
          </button>
        </div>
        {approveStatus && (
          <div className="text-xs mt-2">{approveStatus}</div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">CTF outcome 持仓</h2>
        {positions.length === 0 ? (
          <div className="text-sm text-default-500">无持仓。</div>
        ) : (
          <div className="grid gap-2 text-sm">
            {positions.map((p) => (
              <div key={p.tokenId} className="flex justify-between">
                <span className="font-mono text-xs">{p.tokenId}</span>
                <span>{p.balance.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
