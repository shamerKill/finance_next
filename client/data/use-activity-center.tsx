// Activity Center — lightweight client-side log of async background
// operations. UI lives in components/activity-center.tsx; the context
// here only owns state + persistence so call sites can `push()` /
// `update()` without owning the open-popover state.
//
// Storage:
//   - in-memory ring (last 20 entries) for live updates
//   - last entries also mirrored to localStorage so a reload preserves
//     recent context; clears via the panel's "清空" button
//   - enabled flag persisted under `finance_next_activity_enabled`;
//     default ON. When OFF, push() is a no-op (no notification, no
//     storage write) so it's truly off — not just hidden.

"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_ENABLED_KEY = "finance_next_activity_enabled";
const STORAGE_ITEMS_KEY = "finance_next_activity_items";
const MAX_ITEMS = 20;

export type ActivityKind =
  | "ingest"
  | "backtest"
  | "optimization"
  | "order"
  | "claim-legacy"
  | "ai-test"
  | "other";

export type ActivityStatus = "running" | "success" | "failed" | "canceled";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  label: string;
  status: ActivityStatus;
  detail?: string;
  href?: string; // optional link the panel renders as "查看 →"
  startedAt: number;
  completedAt?: number;
}

interface ActivityCenterValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  items: ActivityItem[];
  // push returns the id so the caller can update() later.
  push: (input: Omit<ActivityItem, "id" | "status" | "startedAt"> & {
    status?: ActivityStatus;
  }) => string;
  update: (id: string, patch: Partial<Omit<ActivityItem, "id">>) => void;
  clear: () => void;
}

const ActivityCenterContext = createContext<ActivityCenterValue | null>(null);

function newID(): string {
  // 16 char base36 — enough for collision-free 20-item rotation.
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
}

function readPersisted(): { enabled: boolean; items: ActivityItem[] } {
  if (typeof window === "undefined") return { enabled: true, items: [] };
  let enabled = true;
  try {
    const e = window.localStorage.getItem(STORAGE_ENABLED_KEY);
    if (e === "false") enabled = false;
  } catch {
    /* ignore */
  }
  let items: ActivityItem[] = [];
  try {
    const raw = window.localStorage.getItem(STORAGE_ITEMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed.slice(0, MAX_ITEMS).filter(
          (i: unknown): i is ActivityItem =>
            typeof i === "object" &&
            i !== null &&
            typeof (i as ActivityItem).id === "string",
        );
        // Reloaded "running" items are stale (the request that drove
        // them is gone). Mark them canceled so the UI doesn't show a
        // perpetual spinner from a dead session.
        items = items.map((i) =>
          i.status === "running"
            ? { ...i, status: "canceled" as const, completedAt: Date.now() }
            : i,
        );
      }
    }
  } catch {
    /* ignore corrupted state */
  }
  return { enabled, items };
}

function writeItems(items: ActivityItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_ITEMS_KEY, JSON.stringify(items));
  } catch {
    /* quota or denied — drop silently */
  }
}

function writeEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function ActivityCenterProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const [items, setItems] = useState<ActivityItem[]>([]);

  // Defer reading localStorage until after mount to avoid hydration
  // mismatch — server renders the default (enabled=true, no items).
  // One-shot external-state hydration; lint's "setState in effect"
  // rule doesn't apply to this pattern.
  useEffect(() => {
    const init = readPersisted();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabledState(init.enabled);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(init.items);
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    writeEnabled(v);
  }, []);

  const push = useCallback<ActivityCenterValue["push"]>(
    (input) => {
      const id = newID();
      // We must short-circuit on disabled inside the callback by
      // reading the latest enabled via the setter pattern — but
      // since this callback closes over `enabled` we depend on the
      // useState binding. The dependency below keeps it fresh.
      if (!enabled) return id;
      setItems((prev) => {
        const next: ActivityItem[] = [
          {
            id,
            kind: input.kind,
            label: input.label,
            status: input.status ?? "running",
            detail: input.detail,
            href: input.href,
            startedAt: Date.now(),
          },
          ...prev,
        ].slice(0, MAX_ITEMS);
        writeItems(next);
        return next;
      });
      return id;
    },
    [enabled],
  );

  const update = useCallback<ActivityCenterValue["update"]>((id, patch) => {
    setItems((prev) => {
      const next = prev.map((i) => {
        if (i.id !== id) return i;
        const merged: ActivityItem = { ...i, ...patch };
        if (
          patch.status &&
          patch.status !== "running" &&
          merged.completedAt == null
        ) {
          merged.completedAt = Date.now();
        }
        return merged;
      });
      writeItems(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    writeItems([]);
  }, []);

  const value = useMemo<ActivityCenterValue>(
    () => ({ enabled, setEnabled, items, push, update, clear }),
    [enabled, setEnabled, items, push, update, clear],
  );

  return (
    <ActivityCenterContext.Provider value={value}>
      {children}
    </ActivityCenterContext.Provider>
  );
}

export function useActivityCenter(): ActivityCenterValue {
  const ctx = useContext(ActivityCenterContext);
  if (ctx == null) {
    // Safe fallback so call sites outside the provider (e.g. early
    // SSR or detached storybook renders) silently no-op rather than
    // crash.
    return {
      enabled: false,
      setEnabled: () => {},
      items: [],
      push: () => "",
      update: () => {},
      clear: () => {},
    };
  }
  return ctx;
}

// withActivity wraps an async API call so its lifecycle (running →
// success/failed) automatically lands in the Activity Center. The
// hook must come from a React component context, so this helper takes
// a pre-bound `activity` instance.
//
// Usage:
//   const activity = useActivityCenter();
//   await withActivity(activity, { kind: "backtest", label: "..." },
//     () => createBacktest(payload));
//
// On success the result of `fn()` is returned unchanged. On failure
// the thrown error is re-raised after marking the activity entry
// failed, so existing try/catch / toast logic at the call site keeps
// working — withActivity is purely additive.
export async function withActivity<T>(
  activity: ActivityCenterValue,
  desc: {
    kind: ActivityKind;
    label: string;
    detail?: string;
    href?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const id = activity.push(desc);
  try {
    const result = await fn();
    activity.update(id, { status: "success" });
    return result;
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    activity.update(id, {
      status: "failed",
      detail: msg.slice(0, 200),
    });
    throw e;
  }
}
