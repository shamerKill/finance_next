# AI Preview Default Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make a freshly analyzed AI money goal immediately show the same default operator action checklist that the backend persists, so the user can see what AI will review, validate, and hand off without waiting for a run detail refresh.

**Architecture:** Add a frontend pure helper that derives the backend-equivalent default run actions from `TypeAIGoalAnalysis`, then use it when constructing the temporary `activeRun` preview in `client/app/(dashboard)/ai-money/client.tsx`. Keep action IDs and safety boundaries unchanged; this only improves preview state consistency and does not add order execution.

**Tech Stack:** Next.js client component, existing `client/data/ai-goal-preset.mjs` helper module, Node test runner, TypeScript typecheck, existing Go backend tests.

# Context
Filename: `docs/plans/2026-06-03-ai-preview-default-actions.md`
Created On: 2026-06-03 02:19:18 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project so the user can give AI a money-making goal, have AI analyze market context, sentiment and human behavior, generate strategy candidates, and make the next safe actions easier to observe and use.

# Project Overview
`finance_next` is a monorepo with `client/` Next.js and `gateway/` Go. The AI Money page already supports AI goal analysis, strategy drafts, validation, sentiment review, delegation runbook, and persisted AI run actions. The backend now seeds default run actions, but the frontend's immediate preview run still has no `actions`, so newly generated analyses briefly lack the action state that downstream panels consume.

# Analysis
The frontend creates a temporary run in `client/app/(dashboard)/ai-money/client.tsx::runFromAnalysis` immediately after `analyzeAIGoal` returns. That temporary run copies analysis metadata but not default actions. Existing UI panels derive `activeActions` from `activeRun.actions`, and helpers such as `aiDelegationRunbookFromState`, `aiCommandCenterFromState`, and `actionPlanFromAnalysis` consume those persisted actions. The backend helper `defaultGoalRunActions` in `gateway/internal/http/handlers/ai_goal.go` already defines the canonical seed rules for `review`, `data`, `sentiment_review`, `backtest`, `strategy`, and `gate`.

# Proposed Solution
Add `defaultAIGoalRunActionsFromAnalysis(analysis, now)` to `client/data/ai-goal-preset.mjs` as a deterministic frontend mirror of the backend seed rules. Use it only for the immediate preview run; once a persisted run is fetched, server actions remain authoritative. This is safer than changing the API response shape and narrower than adding new automation, while directly making the AI's next safe actions visible the moment a target is analyzed.

# Implementation Plan

### Task 1: Frontend Helper RED Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `defaultAIGoalRunActionsFromAnalysis` to the existing import list.

**Step 2: Add failing tests**

Add tests near `actionPlanFromAnalysis`:

```js
test("defaultAIGoalRunActionsFromAnalysis mirrors backend seeded actions", () => {
  const actions = defaultAIGoalRunActionsFromAnalysis(
    {
      context: { notes: ["news empty"], symbols: ["BTC"] },
      humanFactors: ["FOMO 追涨风险"],
      watchSignals: [],
      execution: { mode: "testnet" },
      strategyDrafts: [
        { name: "watch", kind: "watch_only", symbol: "ETHUSDT" },
        { name: "btca", kind: "grid_dca", symbol: "BTCUSDT" },
      ],
    },
    new Date("2026-06-03T02:30:00.000Z"),
  );

  assert.deepEqual(
    actions.map((action) => [action.id, action.status, action.relatedId || ""]),
    [
      ["review", "manual", ""],
      ["data", "blocked", ""],
      ["sentiment_review", "manual", ""],
      ["backtest", "ready", "btca"],
      ["strategy", "ready", "btca"],
      ["gate", "manual", ""],
    ],
  );
  assert.equal(actions.every((action) => action.updatedAt === "2026-06-03T02:30:00.000Z"), true);
  assert.ok(actions.find((action) => action.id === "data").note.includes("news empty"));
  assert.ok(actions.find((action) => action.id === "sentiment_review").note.includes("FOMO"));
});

test("defaultAIGoalRunActionsFromAnalysis blocks execution when only watch drafts exist", () => {
  const actions = defaultAIGoalRunActionsFromAnalysis(
    {
      context: { notes: [] },
      humanFactors: [],
      watchSignals: [],
      execution: { mode: "observe" },
      strategyDrafts: [{ name: "watch", kind: "watch_only", symbol: "BTCUSDT" }],
    },
    new Date("2026-06-03T02:31:00.000Z"),
  );

  assert.equal(actions.find((action) => action.id === "data").status, "done");
  assert.equal(actions.find((action) => action.id === "sentiment_review").status, "done");
  assert.equal(actions.find((action) => action.id === "backtest").status, "blocked");
  assert.equal(actions.find((action) => action.id === "strategy").status, "blocked");
  assert.equal(actions.find((action) => action.id === "gate").status, "blocked");
});
```

**Step 3: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `defaultAIGoalRunActionsFromAnalysis` is not exported.

### Task 2: Implement Frontend Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add:

```js
export function defaultAIGoalRunActionsFromAnalysis(analysis, now = new Date()) { ... }
```

Rules:
- Use the same action IDs as the backend: `review`, `data`, `sentiment_review`, `backtest`, `strategy`, `gate`.
- `data` is `blocked` when `analysis.context.notes` is non-empty, otherwise `done`.
- `sentiment_review` is `manual` when `analysis.humanFactors` or `analysis.watchSignals` is non-empty, otherwise `done`.
- `backtest` and `strategy` are `ready` when the first non-`watch_only` draft with a name or symbol exists, otherwise `blocked`.
- `gate` is `manual` only for `testnet` or `mainnet`; otherwise `blocked`.
- Every action gets an ISO `updatedAt`.

**Step 2: Run GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Wire Preview Run

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Add `defaultAIGoalRunActionsFromAnalysis` to the helper import list.

**Step 2: Populate preview actions**

In `runFromAnalysis`, add:

```ts
actions: defaultAIGoalRunActionsFromAnalysis(analysis) as TypeAIGoalRunAction[],
```

so newly created `activeRun` immediately has the same seeded action IDs the backend will persist.

### Task 4: Verification

**Files:**
- No planned code changes.

**Step 1: Run frontend unit tests**

```bash
node --test client/data/ai-goal-preset.test.mjs
```

**Step 2: Run frontend typecheck**

```bash
cd client && yarn typecheck
```

**Step 3: Run frontend lint**

```bash
cd client && yarn lint
```

Expected: exit 0. A known warning may remain in `client/data/use-activity-center.tsx:138`.

**Step 4: Run backend AI goal tests**

```bash
cd gateway && GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestAIGoalRunPreviewSeedsDefaultActions|TestAIGoalRunPreviewFromAnalysis'
```

**Step 5: Check whitespace diff**

```bash
git diff --check
```

Implementation Checklist:
1. Update `client/data/ai-goal-preset.test.mjs` import with `defaultAIGoalRunActionsFromAnalysis`.
2. Add RED tests for backend-equivalent default run actions and watch-only blocking.
3. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm the expected export failure.
4. Implement `defaultAIGoalRunActionsFromAnalysis` in `client/data/ai-goal-preset.mjs`.
5. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.
6. Import `defaultAIGoalRunActionsFromAnalysis` in `client/app/(dashboard)/ai-money/client.tsx`.
7. Add generated `actions` to `runFromAnalysis`.
8. Run frontend unit tests, typecheck, lint, backend AI goal tests, and `git diff --check`.
9. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 02:19 CST
    *   Step: 1. Update `client/data/ai-goal-preset.test.mjs` import with `defaultAIGoalRunActionsFromAnalysis`.
    *   Modifications: Added the missing helper import to the frontend AI goal preset test file.
    *   Change Summary: Prepared the test suite to assert default AI run preview actions.
    *   Reason: Executing plan step 1.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:19 CST
    *   Step: 2. Add RED tests for backend-equivalent default run actions and watch-only blocking.
    *   Modifications: Added two Node tests covering seeded action statuses, related draft IDs, notes, timestamps, and watch-only blocking.
    *   Change Summary: Captured the intended frontend mirror of backend default AI run actions before implementation.
    *   Reason: Executing plan step 2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:20 CST
    *   Step: 3. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm the expected export failure.
    *   Modifications: No file modifications.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './ai-goal-preset.mjs' does not provide an export named 'defaultAIGoalRunActionsFromAnalysis'`.
    *   Reason: Executing plan step 3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:20 CST
    *   Step: 4. Implement `defaultAIGoalRunActionsFromAnalysis` in `client/data/ai-goal-preset.mjs`.
    *   Modifications: Added `aiGoalRunActionTimestamp`, `firstDefaultActionDraft`, and exported `defaultAIGoalRunActionsFromAnalysis`.
    *   Change Summary: Frontend now derives backend-equivalent default actions for `review`, `data`, `sentiment_review`, `backtest`, `strategy`, and `gate`.
    *   Reason: Executing plan step 4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:20 CST
    *   Step: 5. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.
    *   Modifications: No file modifications.
    *   Change Summary: GREEN confirmed with 114 passing frontend helper tests.
    *   Reason: Executing plan step 5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:21 CST
    *   Step: 6. Import `defaultAIGoalRunActionsFromAnalysis` in `client/app/(dashboard)/ai-money/client.tsx`.
    *   Modifications: Added the helper import to the AI Money client component.
    *   Change Summary: The component can now use the tested default action derivation.
    *   Reason: Executing plan step 6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:21 CST
    *   Step: 7. Add generated `actions` to `runFromAnalysis`.
    *   Modifications: Populated preview run `actions` with `defaultAIGoalRunActionsFromAnalysis(analysis)`.
    *   Change Summary: New AI analyses immediately expose the same default action checklist that the backend persists.
    *   Reason: Executing plan step 7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:22 CST
    *   Step: 8. Run frontend unit tests, typecheck, lint, backend AI goal tests, and `git diff --check`.
    *   Modifications: No file modifications.
    *   Change Summary: Verification passed: Node test 114/114, `yarn typecheck`, `yarn lint` with 0 errors and the known `use-activity-center.tsx:138` warning, backend AI goal tests, `git diff --check`, untracked-file trailing whitespace scan, and local `/ai-money` smoke route compile.
    *   Reason: Executing plan step 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:23 CST
    *   Step: 9. Append task progress and final review to this plan document.
    *   Modifications: Updated this plan's Current Execution Step, Task Progress, and Final Review sections.
    *   Change Summary: Documented implementation evidence and compliance review.
    *   Reason: Executing plan step 9.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The implementation is limited to the planned frontend preview consistency change. `defaultAIGoalRunActionsFromAnalysis` mirrors the backend default action IDs and status rules, and `runFromAnalysis` now attaches those actions to the temporary active run created immediately after a new AI goal analysis. No API response shape, backend persistence path, order submission flow, or execution permission was changed.

Verification evidence:
- RED: `node --test client/data/ai-goal-preset.test.mjs` failed because the helper export did not exist.
- GREEN: `node --test client/data/ai-goal-preset.test.mjs` passed with 114/114 tests.
- `yarn typecheck` passed.
- `yarn lint` passed with 0 errors and the known warning in `client/data/use-activity-center.tsx:138`.
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestAIGoalRunPreviewSeedsDefaultActions|TestAIGoalRunPreviewFromAnalysis'` passed.
- `git diff --check` passed.
- `rg -n "[[:blank:]]$" ...` over the touched untracked files found no trailing whitespace.
- Local dev server smoke passed: `curl -L -sS -I http://127.0.0.1:3000/ai-money` returned a `307` to `/login?next=%2Fai-money` and the followed login page returned `200 OK`; `lsof -nP -iTCP:3000 -sTCP:LISTEN` returned no listener after stopping the server.
