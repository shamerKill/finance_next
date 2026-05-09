"use client";

import { useEffect, useState } from "react";
import { wsUrl } from "./api-client";

// AccountEvent is the envelope the gateway hub pushes for each upstream event.
export type AccountEvent = {
  type: "account.event" | "account.upstream_closed" | "error" | "pong" | string;
  accountId?: string;
  payload?: unknown;
  error?: string;
};

type Listener = (event: AccountEvent) => void;

// AccountStreamClient is a single WebSocket connection multiplexed across many
// subscribers. Reconnect uses exponential backoff capped at 30s. The hub on
// the gateway side already de-duplicates per-account upstreams so we only need
// one socket per browser tab.
class AccountStreamClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private subscribed = new Set<string>();
  private backoff = 500;
  private readonly maxBackoff = 30_000;
  private closing = false;

  private connect() {
    if (this.closing) return;
    this.ws = new WebSocket(wsUrl());

    this.ws.addEventListener("open", () => {
      this.backoff = 500;
      // Re-issue all known subscriptions on reconnect.
      for (const accountId of this.subscribed) {
        this.send({ type: "subscribe", accountId });
      }
    });

    this.ws.addEventListener("message", (ev) => {
      let parsed: AccountEvent | null = null;
      try {
        parsed = JSON.parse(ev.data) as AccountEvent;
      } catch {
        return;
      }
      if (!parsed) return;
      const accountId = parsed.accountId ?? "";
      const set = this.listeners.get(accountId);
      if (set) {
        for (const fn of set) fn(parsed);
      }
    });

    const reconnect = () => {
      this.ws = null;
      if (this.closing) return;
      const delay = Math.min(this.backoff, this.maxBackoff);
      this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
      setTimeout(() => this.connect(), delay);
    };
    this.ws.addEventListener("close", reconnect);
    this.ws.addEventListener("error", () => {
      // Some browsers fire "error" before "close"; close handler will reconnect.
      try { this.ws?.close(); } catch { /* ignore */ }
    });
  }

  private send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(accountId: string, listener: Listener): () => void {
    if (!this.ws) this.connect();
    let set = this.listeners.get(accountId);
    if (!set) {
      set = new Set();
      this.listeners.set(accountId, set);
    }
    set.add(listener);

    if (!this.subscribed.has(accountId)) {
      this.subscribed.add(accountId);
      this.send({ type: "subscribe", accountId });
    }

    return () => {
      const cur = this.listeners.get(accountId);
      if (!cur) return;
      cur.delete(listener);
      if (cur.size === 0) {
        this.listeners.delete(accountId);
        this.subscribed.delete(accountId);
        this.send({ type: "unsubscribe", accountId });
      }
    };
  }

  shutdown() {
    this.closing = true;
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

// Module-level singleton; React hooks below share it across the page.
let singleton: AccountStreamClient | null = null;
function getClient() {
  if (!singleton) singleton = new AccountStreamClient();
  return singleton;
}

// useAccountStream subscribes to events for one account. It tolerates
// SSR/hydration by only opening the socket inside an effect.
//
// `bufferSize` controls how many recent events are kept in the returned log;
// callers needing only the last event can read events[0].
export function useAccountStream(
  accountId: string | null | undefined,
  bufferSize = 25,
) {
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    const client = getClient();
    const off = client.subscribe(accountId, (ev) => {
      if (ev.type === "account.event") setConnected(true);
      if (ev.type === "account.upstream_closed") setConnected(false);
      setEvents((prev) => [ev, ...prev].slice(0, bufferSize));
    });
    return () => {
      off();
      setConnected(false);
    };
  }, [accountId, bufferSize]);

  return { events, last: events[0] ?? null, connected };
}
