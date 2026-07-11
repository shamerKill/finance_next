# AI Saved Backtest Paper Watch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a completed backtest for a saved AI strategy be adopted into paper observation directly from the backtest detail page, while writing the handoff into the source AI goal memory.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that builds a `paper_watch` action patch from a saved strategy and a completed backtest. Add a small client island to `/backtests/[id]` that calls `updateAIGoalRunAction(strategy.aiRunId, "paper_watch", patch)` and shows success/error state.

**Tech Stack:** Next.js server page plus client component, existing API client, existing Activity Center, ESM `node --test` helper tests.

### Task 1: Add failing helper test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `savedStrategyPaperWatchPatchFromBacktest` to the import list.

**Step 2: Add test**

Add near the paper watch action tests:

```js
test("savedStrategyPaperWatchPatchFromBacktest persists paper observation for a completed saved strategy backtest", () => {
  const patch = savedStrategyPaperWatchPatchFromBacktest(
    {
      id: "opt123",
      name: "btca",
      execSymbol: "BTCUSDT",
    },
    {
      runId: "run_btc",
      strategyId: "opt123",
      state: 3,
      metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
    },
  );

  assert.equal(patch.status, "manual");
  assert.equal(patch.relatedId, "run_btc");
  assert.equal(patch.href, "/backtests/run_btc");
  assert.ok(patch.note.includes("btca"));
  assert.ok(patch.note.includes("24-72"));
  assert.ok(patch.note.includes("市场风向"));
  assert.ok(patch.note.includes("人性偏差"));
  assert.ok(patch.note.includes("执行摩擦"));
  assert.ok(patch.note.includes("不进入测试网或主网"));
});
```

**Step 3: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because `savedStrategyPaperWatchPatchFromBacktest` is not exported.

### Task 2: Implement helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Export helper**

Place after `paperWatchActionPatchFromCandidate`:

```js
export function savedStrategyPaperWatchPatchFromBacktest(strategy, backtest) {
  const runId = String(backtest?.runId || "").trim();
  if (!runId || Number(backtest?.state) !== 3) return null;
  const ranked = rankBacktestValidation([backtest])[0] || {};
  const name = String(strategy?.name || backtest?.strategyId || "AI 策略").trim();
  const symbol = String(strategy?.execSymbol || "").trim();
  const score = ranked.score ?? "—";
  return {
    status: "manual",
    relatedId: runId,
    href: `/backtests/${encodeURIComponent(runId)}`,
    note: `${name}${symbol ? ` (${symbol})` : ""} 已完成回测；评分 ${score}，收益 ${formatPercentValue(ranked.totalReturn)}，回撤 ${formatPercentValue(ranked.maxDrawdown)}。进入 24-72 小时 paper 观察：记录市场风向、舆论变化、人性偏差和真实执行摩擦；未通过观察前不进入测试网或主网。`,
  };
}
```

**Step 2: Verify GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

### Task 3: Add backtest paper watch client component

**Files:**
- Create: `client/app/(dashboard)/backtests/[id]/paper-watch-action.tsx`

**Step 1: Implement client component**

Create `SavedBacktestPaperWatchAction`:

```tsx
"use client";

import { useState } from "react";
import { updateAIGoalRunAction } from "@/data/api-client";
import { savedStrategyPaperWatchPatchFromBacktest } from "@/data/ai-goal-preset.mjs";
import type { TypeAIGoalRunActionPatch, TypeBacktest, TypeOption } from "@/data/type";
import { useActivityCenter, withActivity } from "@/data/use-activity-center";
```

Behavior:
- Props: `{ strategy: TypeOption; backtest: TypeBacktest; sourceAiRunId: string }`.
- Build patch via helper; if null, render nothing.
- On click, call `updateAIGoalRunAction(sourceAiRunId, "paper_watch", patch)` through `withActivity`.
- Show button state: idle "采用 paper 观察", busy "写入中...", success "已写入 AI paper 观察"; show error inline.

### Task 4: Wire backtest detail page

**Files:**
- Modify: `client/app/(dashboard)/backtests/[id]/page.tsx`

**Step 1: Import component**

Import `SavedBacktestPaperWatchAction`.

**Step 2: Compute source AI run id**

After loading strategy:

```ts
const sourceAiRunId = strategy?.aiRunId ? String(strategy.aiRunId).trim() : "";
```

**Step 3: Render action**

In `PageHeader action`, keep existing status badge and append the component when `sourceAiRunId` exists:

```tsx
action={
  <div className="flex flex-wrap items-center gap-2">
    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
    {sourceAiRunId && (
      <SavedBacktestPaperWatchAction
        strategy={strategy}
        backtest={head}
        sourceAiRunId={sourceAiRunId}
      />
    )}
  </div>
}
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
1. Add `savedStrategyPaperWatchPatchFromBacktest` test import.
2. Add failing helper test.
3. Run focused tests and confirm RED.
4. Implement `savedStrategyPaperWatchPatchFromBacktest`.
5. Run focused tests and confirm GREEN.
6. Create `paper-watch-action.tsx` client component.
7. Wire the component into the backtest detail `PageHeader`.
8. Run focused tests again.
9. Run `yarn typecheck`.
10. Run `yarn lint`.
11. Smoke `/ai-money` locally and stop dev server.
