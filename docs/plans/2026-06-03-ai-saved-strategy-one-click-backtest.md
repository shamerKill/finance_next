# AI Saved Strategy One Click Backtest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a saved AI strategy start its validation backtest directly from the strategy detail AI handoff panel and write the resulting run back into the source AI goal memory.

**Architecture:** Add a tested pure helper that converts a saved `TypeOption` into the same safe 90 day `TypeCreateBacktest` request used by AI draft validation. Add a small client island in the strategy detail route that calls `createBacktest`, updates the source AI run `backtest` action when available, and navigates to the backtest detail page. Keep the strategy page server-rendered.

**Tech Stack:** Next.js App Router, TypeScript client component, existing REST API client, `node --test` ESM helper tests.

### Task 1: Add failing helper test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `savedStrategyBacktestRequestFromOption` to the import list.

**Step 2: Add test**

Add near the existing `savedStrategyBacktestHrefFromOption` test:

```js
test("savedStrategyBacktestRequestFromOption builds a safe request for a saved AI strategy", () => {
  const request = savedStrategyBacktestRequestFromOption(
    {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
      positionLevel: 4,
      orderGroupMargin: 300,
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      profitRateAfterAtAddPosition: 0.01,
      createCostOrderInProfit: true,
      createPositions: [{ marginRate: 1, lossAddRate: 0 }],
    },
    new Date("2026-06-02T08:00:00Z"),
  );

  assert.deepEqual(request, {
    strategyId: "opt123",
    kind: "grid_dca",
    params: {
      positionLevel: 4,
      orderGroupMargin: 300,
      stopProfitRate: 0.04,
      stopLossRate: 0.08,
      profitRateAfterAtAddPosition: 0.01,
      createCostOrderInProfit: true,
      createPositions: [{ marginRate: 1, lossAddRate: 0 }],
    },
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "1h",
    start: "2026-03-04T08:00:00.000Z",
    end: "2026-06-02T08:00:00.000Z",
    initialCapital: 10000,
    commissionRate: 0.0004,
    slippageBps: 1,
  });
});
```

**Step 3: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because `savedStrategyBacktestRequestFromOption` is not exported.

### Task 2: Implement helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Export `savedStrategyBacktestRequestFromOption`**

Place it after `savedStrategyBacktestHrefFromOption`:

```js
export function savedStrategyBacktestRequestFromOption(strategy, now = new Date()) {
  const id = String(strategy?.id || strategy?.name || "").trim();
  const symbol = String(strategy?.execSymbol || "").trim();
  if (!id || !symbol) return null;
  const end = now instanceof Date ? now : new Date(now);
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    strategyId: id,
    kind: "grid_dca",
    params: savedStrategyBacktestParamsFromOption(strategy),
    symbol,
    exchange: "binance",
    timeframe: "1h",
    start: start.toISOString(),
    end: end.toISOString(),
    initialCapital: 10000,
    commissionRate: 0.0004,
    slippageBps: 1,
  };
}
```

**Step 2: Verify GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

### Task 3: Add client action component

**Files:**
- Create: `client/app/(dashboard)/strategies/[id]/ai-handoff-actions.tsx`

**Step 1: Create client component**

Implement `SavedStrategyBacktestAction`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBacktest, updateAIGoalRunAction } from "@/data/api-client";
import { savedStrategyBacktestRequestFromOption } from "@/data/ai-goal-preset.mjs";
import type { TypeCreateBacktest, TypeOption } from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";

type Props = {
  strategy: TypeOption;
  sourceAiRunId?: string;
  fallbackHref: string;
  label?: string;
};
```

Behavior:
- Build request via helper.
- If helper returns null, show only the fallback link.
- On click, call `createBacktest(request)` through `withActivity`.
- If `sourceAiRunId` exists, call `updateAIGoalRunAction(sourceAiRunId, "backtest", { status:"done", relatedId: handle.runId, href: "/backtests/<runId>", note: "已从保存的 AI 策略发起回测，等待结果后再进入 paper 观察。" })`.
- Navigate to `/backtests/<runId>`.
- Keep fallback link visible as “打开表单”.

### Task 4: Wire the strategy page

**Files:**
- Modify: `client/app/(dashboard)/strategies/[id]/page.tsx`

**Step 1: Import component**

Import `SavedStrategyBacktestAction` from `./ai-handoff-actions`.

**Step 2: Extend panel props**

Change `SavedStrategyHandoffPanel` props to include:

```ts
strategy: TypeOption;
sourceAiRunId?: string;
```

**Step 3: Use client action for run-backtest**

Where the primary link is currently rendered, if `handoff.primaryAction?.kind === "run_backtest"`, render `SavedStrategyBacktestAction` with `strategy`, `sourceAiRunId`, `fallbackHref={handoff.primaryHref}`, and `label={handoff.primaryAction.label}`. Otherwise keep the existing link.

**Step 4: Pass props**

At the render site:

```tsx
{aiDraftHandoff && (
  <SavedStrategyHandoffPanel
    handoff={aiDraftHandoff}
    strategy={strategy}
    sourceAiRunId={sourceAiRunId}
  />
)}
```

### Task 5: Verify

**Files:**
- Verify: `client/data/ai-goal-preset.test.mjs`
- Verify: `client`

**Step 1: Run focused tests**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

**Step 2: Run frontend typecheck**

Run:

```bash
yarn typecheck
```

Expected: pass.

**Step 3: Run frontend lint**

Run:

```bash
yarn lint
```

Expected: exit 0. The known unrelated warning in `client/data/use-activity-center.tsx` may remain.

**Step 4: Smoke `/ai-money`**

Run dev server and request `/ai-money`:

```bash
yarn dev --hostname 127.0.0.1 --port 3000
curl -L -sS -I http://127.0.0.1:3000/ai-money
```

Expected: final HTTP 200 after auth redirect. Stop dev server and confirm port 3000 is free.

Implementation Checklist:
1. Add `savedStrategyBacktestRequestFromOption` test import.
2. Add failing request helper test.
3. Run focused tests and confirm RED.
4. Implement `savedStrategyBacktestRequestFromOption`.
5. Run focused tests and confirm GREEN.
6. Create `ai-handoff-actions.tsx` client component.
7. Wire `SavedStrategyBacktestAction` into the strategy handoff panel.
8. Run focused tests again.
9. Run `yarn typecheck`.
10. Run `yarn lint`.
11. Smoke `/ai-money` locally and stop dev server.
