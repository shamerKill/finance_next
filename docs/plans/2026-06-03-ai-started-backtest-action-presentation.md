# AI Started Backtest Action Presentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money action queue show started validation backtests as in-progress instead of completed results.

**Architecture:** Keep persisted `backtest` action status unchanged so decision logic can still detect already-started validation and avoid duplicate backtests. Add display-only labels to the action queue item produced by `actionPlanFromAnalysis`, then let the AI Money UI prefer those labels.

**Tech Stack:** Next.js client UI, plain JavaScript helpers, Node test runner.

### Task 1: Add data-level presentation for started backtests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Add a test asserting that `actionPlanFromAnalysis()` overlays a persisted started `backtest` action with:
- `status` still equal to `"done"`
- `statusLabel` equal to `"验证中"`
- `hrefLabel` equal to `"查看进度"`

**Step 2: Run the focused test**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `statusLabel` and `hrefLabel` are missing.

**Step 3: Implement minimal helper logic**

In `client/data/ai-goal-preset.mjs`, detect a persisted `backtest` action with `status: "done"` and started run IDs from `backtestRunIdsFromAction()`, then add display-only labels to the overlaid item.

**Step 4: Run the focused test again**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: Use presentation labels in the AI Money action queue

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend the local action item type**

Add optional `statusLabel?: string` and `hrefLabel?: string`.

**Step 2: Render display labels**

In `ActionQueue`, prefer `item.statusLabel` over `actionText(item.status)`. In `ActionButton`, prefer `item.hrefLabel` over `"查看结果"` for done items with links.

**Step 3: Verify**

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`

Expected: tests and typecheck pass; lint may retain the known unrelated warning in `client/data/use-activity-center.tsx`.
