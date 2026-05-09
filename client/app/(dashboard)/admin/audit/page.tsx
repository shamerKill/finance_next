"use client";

import { useEffect, useState } from "react";

import { TypeAuditEntry, listAudit } from "@/data/api-client";

const ADMIN_KEY_STORAGE = "finance_next_admin_key";

// Phase 7 audit viewer. Renders the most recent rows from /admin/audit
// with simple filter controls. The admin key is read from localStorage
// (set on the /admin page); without it, every request 401s and we show
// an empty list.
export default function AuditPage() {
  const [adminKey, setAdminKey] = useState("");
  const [entries, setEntries] = useState<TypeAuditEntry[]>([]);
  const [actor, setActor] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdminKey(window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");
  }, []);

  const refresh = async () => {
    if (!adminKey) return;
    try {
      setError(null);
      const rows = await listAudit(adminKey, {
        actor: actor || undefined,
        resourceType: resourceType || undefined,
        limit: 200,
      });
      setEntries(rows);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <div className="flex gap-2 items-end">
        <label className="text-sm">
          Actor
          <input
            className="border rounded px-2 py-1 ml-2"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Resource type
          <select
            className="border rounded px-2 py-1 ml-2"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          >
            <option value="">all</option>
            <option value="strategy">strategy</option>
            <option value="account">account</option>
            <option value="order">order</option>
            <option value="recommendation">recommendation</option>
            <option value="system">system</option>
            <option value="market">market</option>
          </select>
        </label>
        <button
          className="bg-primary text-white rounded px-3 py-1"
          onClick={refresh}
        >
          Refresh
        </button>
      </div>
      {error && <div className="text-danger text-sm">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1">Timestamp</th>
            <th className="py-1">Actor</th>
            <th className="py-1">Action</th>
            <th className="py-1">Resource</th>
            <th className="py-1">Status</th>
            <th className="py-1">IP</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b align-top">
              <td className="py-1 font-mono text-xs">
                {new Date(e.ts).toISOString()}
              </td>
              <td className="py-1">{e.actor}</td>
              <td className="py-1 font-mono">{e.action}</td>
              <td className="py-1">
                {e.resourceType}
                {e.resourceId ? `/${e.resourceId}` : ""}
              </td>
              <td className="py-1">{e.statusCode}</td>
              <td className="py-1 font-mono text-xs">{e.ip ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <div className="text-default-500">no entries</div>
      )}
    </div>
  );
}
