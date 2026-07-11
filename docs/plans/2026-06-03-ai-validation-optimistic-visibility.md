# AI Validation Optimistic Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show AI-created validation backtests immediately after batch creation, before the polling fetch returns full backtest documents.

**Architecture:** Add a pure frontend helper that converts `autoValidationPlanFromAnalysis` plus `createBacktest` handles into pending `TypeBacktest`-shaped rows. Use those rows in `runValidationBacktests` immediately after handles are created. Polling remains authoritative and will replace the optimistic rows with backend data.

**Tech Stack:** Existing `client/data/ai-goal-preset.mjs` helpers, Next.js client state, Node test runner, TypeScript typecheck.

# Context
Filename: `docs/plans/2026-06-03-ai-validation-optimistic-visibility.md`
Created On: 2026-06-03 02:47:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project so the user can give AI a target, let AI analyze and start safe validation, then immediately observe what AI has started without waiting for a polling round trip.

# Project Overview
The AI Money page can run `analyzeAndValidateGoal`, which analyzes a goal and creates backtests for runnable AI drafts. After creation, the app updates the persisted `backtest` action with run IDs, then polling loads full backtest docs. There is a short gap where AI has created validation runs, but the local `validationRuns` list can still be empty.

# Analysis
`client/app/(dashboard)/ai-money/client.tsx::runValidationBacktests` receives `TypeBacktestHandle[]` from `createBacktest`, but it does not immediately convert those handles into visible validation rows. `client/data/ai-goal-preset.mjs` already has `autoValidationPlanFromAnalysis` and `backtestActionUpdateFromValidationResult`, so a helper can use the same plan items to build safe pending rows.

# Proposed Solution
Add `optimisticValidationRunsFromHandles(plan, handles, now)` in `client/data/ai-goal-preset.mjs`, export it, test it, and call `setValidationRuns(...)` as soon as handles exist. Rows should have `state: 1`, `progress: 0`, empty metrics/trades/error, and request/draft metadata from the plan. This is only UI state; backend polling still replaces it.

# Implementation Plan

### Task 1: Frontend RED Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `optimisticValidationRunsFromHandles` to the existing import list.

**Step 2: Add test near validation helper tests**

Add:

```js
test("optimisticValidationRunsFromHandles exposes pending AI validation runs immediately", () => {
  const plan = autoValidationPlanFromAnalysis(
    {
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: { stopProfitRate: 0.04 } },
        { name: "etha", kind: "grid_dca", symbol: "ETH", params: { positionLevel: 2 } },
      ],
    },
    new Date("2026-06-03T02:47:00.000Z"),
  );

  const rows = optimisticValidationRunsFromHandles(
    plan,
    [
      { runId: "run_btc_1", enqueuedAt: "2026-06-03T02:48:00.000Z" },
      { runId: "run_eth_2", enqueuedAt: "2026-06-03T02:48:01.000Z" },
    ],
    new Date("2026-06-03T02:49:00.000Z"),
  );

  assert.deepEqual(
    rows.map((row) => [row.runId, row.strategyId, row.state, row.progress, row.request.symbol]),
    [
      ["run_btc_1", "btca", 1, 0, "BTCUSDT"],
      ["run_eth_2", "etha", 1, 0, "ETHUSDT"],
    ],
  );
  assert.equal(rows[0].createdAt, "2026-06-03T02:48:00.000Z");
  assert.deepEqual(rows[0].metrics, {});
  assert.deepEqual(rows[0].trades, []);
});
```

**Step 3: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because the helper export does not exist.

### Task 2: Implement Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add near `backtestActionUpdateFromValidationResult`:

```js
export function optimisticValidationRunsFromHandles(plan, handles = [], now = new Date()) { ... }
```

Rules:
- Match each handle by index to `plan.items`.
- Skip handles without `runId`.
- Use `handle.enqueuedAt` when present, otherwise `now.toISOString()`.
- Build rows with `runId`, `strategyId`, `kind`, `params`, `request`, `state: 1`, `progress: 0`, `metrics: {}`, `trades: []`, `startedAt: null`, `finishedAt: null`, `error: ""`.

**Step 2: Run GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Wire Client State

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Add `optimisticValidationRunsFromHandles` to the helper import list.

**Step 2: Set local validation rows**

In `runValidationBacktests`, after `handles.length > 0`, call:

```ts
setValidationRuns(
  optimisticValidationRunsFromHandles(plan, handles) as TypeBacktest[],
);
setValidationError(null);
```

before the action update attempt.

### Task 4: Verification

**Files:**
- No planned code changes.

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs client/app/\(dashboard\)/ai-money/client.tsx docs/plans/2026-06-03-ai-validation-optimistic-visibility.md
```

Expected:
- Node tests pass.
- Typecheck passes.
- Lint exits 0; the known `client/data/use-activity-center.tsx:138` warning may remain.
- No trailing whitespace.

Implementation Checklist:
1. Import `optimisticValidationRunsFromHandles` in the test file.
2. Add RED test for pending optimistic validation rows.
3. Run the Node test and confirm RED.
4. Implement `optimisticValidationRunsFromHandles`.
5. Run the Node test and confirm GREEN.
6. Import the helper in `client/app/(dashboard)/ai-money/client.tsx`.
7. Set optimistic `validationRuns` immediately after batch handles are created.
8. Run verification commands.
9. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Completed"

# Task Progress
*   2026-06-03 02:43:59 CST
    *   Step: 1-3. Import helper in the test file, add the RED test, and run the Node test.
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` to import `optimisticValidationRunsFromHandles` and assert that pending AI validation rows are exposed from backtest handles.
    *   Change Summary: Confirmed the expected RED state with a missing export failure.
    *   Reason: Executing plan steps 1-3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:43:59 CST
    *   Step: 4-5. Implement `optimisticValidationRunsFromHandles` and run the Node test.
    *   Modifications: Added `safeDateISOString` and `optimisticValidationRunsFromHandles` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: The helper maps validation plan items and created handles into pending `TypeBacktest`-shaped rows with state 1, progress 0, empty metrics/trades, and request metadata.
    *   Reason: Executing plan steps 4-5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:43:59 CST
    *   Step: 6-7. Import the helper in the AI Money page and set optimistic validation rows after batch handles are created.
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` to import `optimisticValidationRunsFromHandles` and call `setValidationRuns(...)` plus `setValidationError(null)` before persisting the backtest action update.
    *   Change Summary: Users can now see AI-created validation backtests immediately after creation, while polling remains authoritative for full backend data.
    *   Reason: Executing plan steps 6-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:43:59 CST
    *   Step: 8. Run verification commands.
    *   Modifications: No code changes.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs` passed 116/116; `yarn typecheck` passed; `yarn lint` exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; `git diff --check` passed; trailing whitespace scan found no matches; local smoke returned `/ai-money -> /login?next=%2Fai-money -> 200 OK` and no dev server process remained on port 3000.
    *   Reason: Executing plan step 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The helper was tested with a RED/GREEN cycle and uses only plan item and handle metadata to create pending validation rows. The AI Money page sets those rows immediately after successful batch creation and before action persistence, so backend polling still owns the final validation run data. No unreported deviations were detected.
