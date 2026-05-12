"use client";

import { useEffect, useState } from "react";

import { TypeAuditEntry, listAudit } from "@/data/api-client";

// Phase 7 audit viewer. Renders the most recent rows from /admin/audit.
// Auth is by JWT cookie role=admin (apiFetch forwards the cookie);
// non-admin sessions get a 403 and the table stays empty.
export default function AuditPage() {
  const [entries, setEntries] = useState<TypeAuditEntry[]>([]);
  const [actor, setActor] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      const rows = await listAudit({
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
  }, []);

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">审计日志</h1>
      <div className="flex gap-2 items-end">
        <label className="text-sm">
          操作者
          <input
            className="border rounded px-2 py-1 ml-2"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </label>
        <label className="text-sm">
          资源类型
          <select
            className="border rounded px-2 py-1 ml-2"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          >
            <option value="">全部</option>
            <option value="strategy">策略</option>
            <option value="account">账户</option>
            <option value="order">订单</option>
            <option value="recommendation">推荐</option>
            <option value="system">系统</option>
            <option value="market">行情</option>
          </select>
        </label>
        <button
          className="bg-primary text-white rounded px-3 py-1"
          onClick={refresh}
        >
          刷新
        </button>
      </div>
      {error && <div className="text-danger text-sm">{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1">时间</th>
            <th className="py-1">操作者</th>
            <th className="py-1">操作</th>
            <th className="py-1">资源</th>
            <th className="py-1">状态</th>
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
        <div className="text-default-500">暂无记录</div>
      )}
    </div>
  );
}
