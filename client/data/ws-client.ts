"use client";

import { useEffect, useState } from "react";
import { wsUrl } from "./api-client";

// Phase 3 generalised the gateway's WS hub to a (topic, id) subscription
// model. The browser can subscribe to:
//   - { topic: "account", id: <accountId> }   → account user-data events
//   - { topic: "backtest", id: <runId> }      → live backtest progress
//
// The gateway preserves the legacy account envelope shape ({type:
// "account.event", accountId, payload}) so existing consumers continue to
// work. New backtest envelopes use {type, topic, id, payload}.

export type WsTopic = "account" | "backtest";

export type WsEvent = {
  // Examples: "account.event", "account.upstream_closed", "backtest.progress",
  // "backtest.completed", "backtest.upstream_closed", "pong", "error"
  type: string;
  topic?: WsTopic;
  id?: string;
  // Legacy field retained for account envelopes.
  accountId?: string;
  payload?: unknown;
  error?: string;
};

type Listener = (event: WsEvent) => void;

// Stable map key for topic+id pairs.
const tk = (topic: WsTopic, id: string) => `${topic}:${id}`;

class HubClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private subscribed = new Set<string>(); // topic-key strings
  private subscribedMeta = new Map<string, { topic: WsTopic; id: string }>();
  private backoff = 500;
  private readonly maxBackoff = 30_000;
  private closing = false;

  private connect() {
    if (this.closing) return;
    this.ws = new WebSocket(wsUrl());

    this.ws.addEventListener("open", () => {
      this.backoff = 500;
      // Re-issue subscriptions on reconnect.
      for (const key of this.subscribed) {
        const meta = this.subscribedMeta.get(key);
        if (meta) this.send({ type: "subscribe", topic: meta.topic, id: meta.id });
      }
    });

    this.ws.addEventListener("message", (ev) => {
      let parsed: WsEvent | null = null;
      try {
        parsed = JSON.parse(ev.data) as WsEvent;
      } catch {
        return;
      }
      if (!parsed) return;

      // Route the event to the right (topic, id) listener set. Legacy
      // account envelopes don't carry a `topic` field; infer from accountId.
      let key: string | null = null;
      if (parsed.topic && parsed.id) {
        key = tk(parsed.topic, parsed.id);
      } else if (parsed.accountId) {
        key = tk("account", parsed.accountId);
      }

      if (!key) {
        // Untargeted (e.g. global "pong"). Broadcast to all listeners.
        for (const set of this.listeners.values()) {
          for (const fn of set) fn(parsed);
        }
        return;
      }
      const set = this.listeners.get(key);
      if (set) for (const fn of set) fn(parsed);
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
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
    });
  }

  private send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(topic: WsTopic, id: string, listener: Listener): () => void {
    if (!this.ws) this.connect();
    const key = tk(topic, id);
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);

    if (!this.subscribed.has(key)) {
      this.subscribed.add(key);
      this.subscribedMeta.set(key, { topic, id });
      this.send({ type: "subscribe", topic, id });
    }

    return () => {
      const cur = this.listeners.get(key);
      if (!cur) return;
      cur.delete(listener);
      if (cur.size === 0) {
        this.listeners.delete(key);
        this.subscribed.delete(key);
        this.subscribedMeta.delete(key);
        this.send({ type: "unsubscribe", topic, id });
      }
    };
  }

  shutdown() {
    this.closing = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

let singleton: HubClient | null = null;
function getClient() {
  if (!singleton) singleton = new HubClient();
  return singleton;
}

// ---- Public hooks ---------------------------------------------------------

// Backwards-compat alias. AccountEvent matches the phase-1 type.
export type AccountEvent = WsEvent;

export function useAccountStream(
  accountId: string | null | undefined,
  bufferSize = 25,
) {
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    const off = getClient().subscribe("account", accountId, (ev) => {
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

// Phase 3: subscribe to live backtest progress for a single run.
//
// Returned shape:
//   - events: ring buffer of recent envelopes
//   - last: most recent envelope
//   - progress: 0..1 derived from the latest progress event
//   - state: latest BacktestState int (1..4) reported by the worker
//   - completed: true once a backtest.completed envelope has arrived
export function useBacktestStream(
  runId: string | null | undefined,
  bufferSize = 25,
) {
  // The hook is intended to be used in a component keyed by runId
  // (e.g. <LiveProgress key={runId} runId={runId} />) so changing the
  // runId remounts the component and gives us fresh state without an
  // imperative reset inside the effect.
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!runId) return;
    const off = getClient().subscribe("backtest", runId, (ev) => {
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      if (typeof payload["progress"] === "number")
        setProgress(payload["progress"] as number);
      if (typeof payload["state"] === "number")
        setState(payload["state"] as number);
      if (ev.type === "backtest.completed") setCompleted(true);
      setEvents((prev) => [ev, ...prev].slice(0, bufferSize));
    });
    return () => {
      off();
    };
  }, [runId, bufferSize]);

  return { events, last: events[0] ?? null, progress, state, completed };
}
