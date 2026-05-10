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
      setApproveStatus("admin key not set in localStorage");
      return;
    }
    const amt = parseFloat(approveAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      setApproveStatus("amount must be > 0");
      return;
    }
    try {
      const res = await approveWallet(id, adminKey, amt);
      setApproveStatus(`approved $${res.amountApproved.toFixed(2)} — tx ${res.txHash}`);
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
    return <div className="text-sm text-default-500">Loading…</div>;
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{wallet.label}</h1>
      <div className="text-xs text-default-500 font-mono">
        {wallet.address}
      </div>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">USDC balance + allowance</h2>
        {balance ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Balance: ${balance.balanceUsdc.toFixed(2)}</div>
            <div>Allowance: ${balance.allowanceUsdc.toFixed(2)}</div>
          </div>
        ) : (
          <div className="text-sm text-default-500">
            Polygon RPC not configured or balance fetch failed.
          </div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">Bounded USDC approve (admin)</h2>
        <div className="text-xs text-default-500 mb-2">
          Approval is hard-capped by{" "}
          <code>portfolio_limits.maxOpenNotionalUsd</code>. Infinite approve
          is impossible by design. Admin key required.
        </div>
        <div className="flex gap-2 items-end">
          <label className="text-sm flex flex-col gap-1">
            <span>Amount (USDC)</span>
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
            Approve
          </button>
        </div>
        {approveStatus && (
          <div className="text-xs mt-2">{approveStatus}</div>
        )}
      </section>

      <section className="border border-default-200 rounded p-4">
        <h2 className="font-semibold mb-2">CTF outcome positions</h2>
        {positions.length === 0 ? (
          <div className="text-sm text-default-500">No positions.</div>
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
