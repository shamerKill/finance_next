# AI Money Auto Open Priority Run Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money automatically open the most useful existing AI run on first load so the user can immediately observe the current AI analysis and next action.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that selects the initial run to open from the existing follow-up queue. The React page will call `openRun()` once after the historical run list loads, only when there is no URL `runId` and no active run.

**Tech Stack:** Next.js client component, React effects, TypeScript, Node test runner for `.mjs` helper tests.

# Context
Filename: 2026-06-03-ai-money-auto-open-priority-run.md
Created On: 2026-06-03 11:43:03 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The AI Money page loads recent AI runs into the sidebar/list, but unless the URL includes `runId`, it does not automatically open any run. This forces the user to manually inspect history before seeing the latest or highest-priority AI analysis. The goal is to reduce that manual step and make the page default to an observable AI state.

# Project Overview
`finance_next` is a monorepo with a Next.js client and Go gateway. This task only touches the AI Money frontend and the pure AI goal helper/test file.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
Relevant files:

`client/app/(dashboard)/ai-money/client.tsx` fetches `listAIGoalRuns(20)` on mount and stores the rows in `runs`. It only opens a run automatically when `requestedRunId` exists. `activeRun` and `analysis` remain empty otherwise.

`client/data/ai-goal-preset.mjs` already has `aiRunFollowupQueueFromRuns()`, which ranks runs by action priority such as paper watch, validation, context refresh, saved strategy follow-up, and general review. Reusing this ranking gives a better default than blindly opening the newest run.

`client/data/ai-goal-preset.test.mjs` has adjacent tests for follow-up queue behavior and should receive the new helper tests first.

# Proposed Solution
Add `aiInitialRunToOpenFromRuns({ runs, requestedRunId, activeRunId, alreadyOpenedRunId, now })`.

The helper returns `null` when a requested URL run is present, when an active run already exists, when the same automatic run was already opened, or when there are no runs. Otherwise, it reads `aiRunFollowupQueueFromRuns()` and returns the top queue action's `runId` when available. If no queue item has a run id, it falls back to the first run with an id, preserving the list's newest-first ordering.

The page then adds one effect after `openRun()` exists. Once `runsBusy` is false, it asks the helper for a run id and calls `openRun({ id })`. It records the id in `autoOpenedRunIdRef` to avoid repeated fetches.

Alternative approaches considered:

Opening the newest run is simpler but ignores pending paper watch or validation follow-up. Opening today's radar run is useful for daily rhythm but misses urgent historical evidence. Ranking by the existing follow-up queue uses the product logic already built for AI delegation.

# Implementation Plan

### Task 1: Add RED Tests For Initial Run Selection

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing tests**

Import `aiInitialRunToOpenFromRuns` and add tests after the follow-up queue tests:

```js
test("aiInitialRunToOpenFromRuns chooses the highest-priority follow-up run", () => {
  const selected = aiInitialRunToOpenFromRuns({
    runs: [
      {
        id: "latest",
        goal: "最新普通复盘",
        symbols: ["ETH"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 0,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T04:00:00.000Z",
        actions: [],
      },
      {
        id: "paper",
        goal: "paper 观察待复盘",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 1,
        contextNewsCount: 4,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [{ id: "paper_watch", status: "manual", href: "/backtests/run1" }],
      },
    ],
    now: new Date("2026-06-03T05:00:00.000Z"),
  });

  assert.equal(selected, "paper");
});

test("aiInitialRunToOpenFromRuns respects explicit and repeated open guards", () => {
  const runs = [{ id: "run1", goal: "BTC AI run", createdAt: "2026-06-03T04:00:00.000Z" }];

  assert.equal(aiInitialRunToOpenFromRuns({ runs, requestedRunId: "run1" }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs, activeRunId: "run1" }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs, alreadyOpenedRunId: "run1" }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs: [] }), null);
  assert.equal(aiInitialRunToOpenFromRuns({ runs }), "run1");
});
```

**Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiInitialRunToOpenFromRuns` is not exported.

### Task 2: Implement Pure Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add the helper after `aiRunFollowupQueueFromRuns()`**

```js
export function aiInitialRunToOpenFromRuns({
  runs = [],
  requestedRunId = "",
  activeRunId = "",
  alreadyOpenedRunId = "",
  now = new Date(),
} = {}) {
  const list = Array.isArray(runs) ? runs : [];
  if (requestedRunId || activeRunId || list.length === 0) return null;
  const queue = aiRunFollowupQueueFromRuns(list, now);
  const runId = String(queue?.primaryAction?.runId || list.find((run) => run?.id)?.id || "");
  if (!runId || runId === alreadyOpenedRunId) return null;
  return runId;
}
```

**Step 2: Run the focused test to verify it passes**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Wire Into AI Money Page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Add `aiInitialRunToOpenFromRuns` to imports and define a typed wrapper:

```ts
const chooseInitialRunToOpen = aiInitialRunToOpenFromRuns as unknown as (input: {
  runs: TypeAIGoalRun[];
  requestedRunId: string;
  activeRunId?: string;
  alreadyOpenedRunId?: string;
}) => string | null;
```

**Step 2: Add the auto-open effect after the requested-run effect**

```ts
useEffect(() => {
  if (runsBusy) return;
  const runId = chooseInitialRunToOpen({
    runs,
    requestedRunId,
    activeRunId: activeRun?.id,
    alreadyOpenedRunId: autoOpenedRunIdRef.current,
  });
  if (!runId) return;
  autoOpenedRunIdRef.current = runId;
  void openRun({ id: runId });
}, [activeRun?.id, openRun, requestedRunId, runs, runsBusy]);
```

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
```

Expected: PASS.

Run:

```bash
cd client && yarn typecheck
```

Expected: PASS.

Run:

```bash
cd client && yarn lint
```

Expected: exit 0. Existing warning in `client/data/use-activity-center.tsx:138` may remain.

Run:

```bash
git diff --check
```

Expected: PASS.

Implementation Checklist:
1. Add failing tests for `aiInitialRunToOpenFromRuns` in `client/data/ai-goal-preset.test.mjs`.
2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure from the missing export.
3. Implement `aiInitialRunToOpenFromRuns()` in `client/data/ai-goal-preset.mjs`.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm it passes.
5. Import and type `aiInitialRunToOpenFromRuns` in `client/app/(dashboard)/ai-money/client.tsx`.
6. Add the auto-open effect after the requested-run effect.
7. Run node tests, typecheck, lint, and `git diff --check`.
8. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 11:43:03 +0800
    *   Step: 1. Add failing tests for `aiInitialRunToOpenFromRuns` in `client/data/ai-goal-preset.test.mjs`; 2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure from the missing export.
    *   Modifications: Added the import and two behavior tests covering highest-priority run selection and open guards.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './ai-goal-preset.mjs' does not provide an export named 'aiInitialRunToOpenFromRuns'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:43:03 +0800
    *   Step: 3. Implement `aiInitialRunToOpenFromRuns()` in `client/data/ai-goal-preset.mjs`; 4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm it passes.
    *   Modifications: Added `aiInitialRunToOpenFromRuns()` after `aiRunFollowupQueueFromRuns()`.
    *   Change Summary: GREEN confirmed with 209 passing `ai-goal-preset` tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:43:03 +0800
    *   Step: 5. Import and type `aiInitialRunToOpenFromRuns` in `client/app/(dashboard)/ai-money/client.tsx`; 6. Add the auto-open effect after the requested-run effect.
    *   Modifications: Added `chooseInitialRunToOpen` wrapper and a guarded effect that opens the highest-priority existing AI run after `runs` load when no URL run and no active run are present.
    *   Change Summary: First page load can now land directly on the most important existing AI run instead of requiring manual history inspection.
    *   Reason: Executing plan steps 5-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:46:25 +0800
    *   Step: 7. Run node tests, typecheck, lint, and `git diff --check`; 8. Update Task Progress and Final Review in this document.
    *   Modifications: Ran planned verification commands and updated this document.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` passed with 211 tests; `yarn typecheck` passed; `yarn lint` exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`; `git diff --check` passed.
    *   Reason: Executing plan steps 7-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan. No unreported deviations were found.

Security and safety review: the change only opens an existing AI run in the UI. It does not create orders, change execution mode, alter credentials, or bypass paper/testnet guardrails.

Maintainability review: the initial-open decision is centralized in a tested pure helper and reuses the existing follow-up queue ranking instead of duplicating priority rules in the React component.
