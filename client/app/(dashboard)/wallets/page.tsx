import Link from "next/link";

import { listWallets } from "@/data/api-client";
import { TypeWallet } from "@/data/type";

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  let wallets: TypeWallet[] = [];
  let error: string | null = null;
  try {
    wallets = await listWallets();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Polygon Wallets</h1>
        <Link
          href="/wallets/new"
          className="px-3 py-2 rounded bg-primary text-white text-sm"
        >
          + Add wallet
        </Link>
      </div>

      <div className="rounded border border-warning bg-warning/10 p-3 text-sm mb-4">
        <strong>Polymarket security model:</strong> Polygon wallet private keys
        are stored encrypted with the same envelope provider as exchange API
        keys. They never appear in API responses and are scrubbed from audit
        logs. USDC approvals are <em>bounded</em> — capped by{" "}
        <code>portfolio_limits.maxOpenNotionalUsd</code>; infinite approve is
        disabled by design. Polymarket has no testnet — three gates required
        for any order.
      </div>

      {error && (
        <div className="rounded border border-danger p-3 text-sm text-danger mb-4">
          Failed to load wallets: {error}
        </div>
      )}

      {wallets.length === 0 && !error && (
        <p className="text-default-500 text-sm">
          No wallets yet. Add a Polygon wallet (private key) to start trading
          Polymarket.
        </p>
      )}

      <div className="grid gap-3">
        {wallets.map((w) => (
          <Link
            key={w.id}
            href={`/wallets/${w.id}`}
            className="border border-default-200 rounded p-4 hover:border-primary"
          >
            <div className="font-medium">{w.label}</div>
            <div className="text-xs text-default-500 mt-1 font-mono">
              {w.address}
            </div>
            {w.usdcBalanceCached != null && (
              <div className="text-xs text-default-500 mt-1">
                USDC cached: {w.usdcBalanceCached.toFixed(2)} · allowance:{" "}
                {(w.usdcAllowanceCached ?? 0).toFixed(2)}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
