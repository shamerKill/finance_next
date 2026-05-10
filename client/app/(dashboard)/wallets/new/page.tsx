"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createWallet } from "@/data/api-client";

export default function NewWalletPage() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [expectedAddress, setExpectedAddress] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!acknowledged) {
      setError("You must acknowledge the security warning before continuing.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const w = await createWallet({
        label,
        privateKey: privateKey.trim(),
        expectedAddress: expectedAddress.trim() || undefined,
      });
      router.push(`/wallets/${w.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">Add Polygon Wallet</h1>

      <div className="rounded border-2 border-danger bg-danger/10 p-4 mb-6 text-sm">
        <div className="font-bold text-danger mb-2 text-base">
          ⚠ DANGER — Read carefully
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Anyone with this private key controls all funds in the
            wallet</strong>, including USDC and any outcome tokens. Loss /
            leak is irreversible — there is no password reset.
          </li>
          <li>
            The key is encrypted at rest with AES-256-GCM (envelope
            encryption, same as exchange API keys) and is{" "}
            <strong>never returned in any API response</strong>.
          </li>
          <li>
            Audit logs scrub the key from every request body — but anyone
            with database access can still decrypt with the master KEK.
          </li>
          <li>
            <strong>Use a dedicated trading wallet</strong> with only the
            funds you can afford to lose. Don&apos;t paste your main wallet&apos;s
            seed-derived key.
          </li>
          <li>
            Polymarket has <strong>no testnet</strong>. Real trades require the
            three-gate flow (env + admin token + strategy mode=mainnet).
          </li>
        </ul>
      </div>

      <form className="grid gap-4" onSubmit={submit}>
        <label className="text-sm flex flex-col gap-1">
          <span>Label</span>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border border-default-200 rounded px-2 py-1"
            placeholder="primary-trading"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>Private key (64-hex)</span>
          <input
            required
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="border border-default-200 rounded px-2 py-1 font-mono"
            placeholder="0x..."
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          <span>Expected address (optional, 0x...)</span>
          <input
            value={expectedAddress}
            onChange={(e) => setExpectedAddress(e.target.value)}
            className="border border-default-200 rounded px-2 py-1 font-mono"
            placeholder="0x..."
          />
        </label>

        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>
            I understand the risks above and have a backup of this private
            key offline.
          </span>
        </label>

        {error && (
          <div className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-primary text-white text-sm disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create wallet"}
        </button>
      </form>
    </div>
  );
}
