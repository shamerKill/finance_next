"use client";

import { useAccountStream } from "@/data/ws-client";

// AccountStreamPanel renders a tail of recent user-data events for the given
// account. The reconnect/backoff lives in ws-client's singleton; the buffer is
// maintained inside useAccountStream itself so we don't double-buffer here.
//
// Node 2.C.5.a — palette swapped to semantic tokens; logic untouched.
export default function AccountStreamPanel({
  accountId,
}: {
  accountId: string;
}) {
  const { events, connected, notice } = useAccountStream(accountId);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? "bg-accent-up" : "bg-text-tertiary"
          }`}
        />
        <span className="text-text-secondary">
          {connected ? "已连接" : "等待事件中"}
        </span>
      </div>
      {notice && (
        <div className="mb-2 text-xs px-2 py-1 rounded bg-warning-50 text-warning-700 border border-warning-200">
          ⚠️ {notice}
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          暂无事件。该账户的交易将在此实时推送。
        </p>
      ) : (
        <ul className="text-xs font-mono tnum max-h-72 overflow-auto border border-border-default rounded p-2 bg-bg-surface-2">
          {events.map((ev, idx) => (
            <li
              key={idx}
              className="py-1 border-b border-border-default last:border-b-0"
            >
              <span className="text-brand-primary mr-2">[{ev.type}]</span>
              {ev.error ? (
                <span className="text-accent-down">{ev.error}</span>
              ) : (
                <span className="text-text-primary">
                  {JSON.stringify(ev.payload)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
