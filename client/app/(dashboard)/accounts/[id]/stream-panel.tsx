"use client";

import { useAccountStream } from "@/data/ws-client";

// AccountStreamPanel renders a tail of recent user-data events for the given
// account. The reconnect/backoff lives in ws-client's singleton; the buffer is
// maintained inside useAccountStream itself so we don't double-buffer here.
export default function AccountStreamPanel({ accountId }: { accountId: string }) {
  const { events, connected, notice } = useAccountStream(accountId);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "bg-success" : "bg-default-400"
          }`}
        />
        <span className="text-default-500">
          {connected ? "已连接" : "等待事件中"}
        </span>
      </div>
      {notice && (
        <div className="mb-2 text-xs px-2 py-1 rounded bg-warning-50 text-warning-700 border border-warning-200">
          ⚠️ {notice}
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-default-500">
          暂无事件。该账户的交易将在此实时推送。
        </p>
      ) : (
        <ul className="text-xs font-mono max-h-72 overflow-auto border border-default-200 rounded p-2 bg-default-50">
          {events.map((ev, idx) => (
            <li key={idx} className="py-1 border-b border-default-200 last:border-b-0">
              <span className="text-primary mr-2">[{ev.type}]</span>
              {ev.error ? (
                <span className="text-danger">{ev.error}</span>
              ) : (
                <span>{JSON.stringify(ev.payload)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
