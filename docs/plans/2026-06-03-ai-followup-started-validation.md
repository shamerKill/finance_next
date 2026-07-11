# AI Follow-up Started Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent historical AI run follow-ups from asking users to rerun validation when backtests were already started.

**Architecture:** Keep the persisted `backtest` action status unchanged. Teach `aiRunFollowupItem()` to treat a done backtest action with run IDs as validation in progress, then map that follow-up to an open-link action instead of a validate-run action.

**Tech Stack:** Plain JavaScript helpers, Node test runner.

### Task 1: Add a regression test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test for `aiRunFollowupQueueFromRuns()` using a run with:
- `strategyDraftCount > 0`
- action `{ id: "backtest", status: "done", relatedId: "run_btc_1", href: "/backtests/run_btc_1" }`

Expected queue item:
- `actionKind: "validation_progress"`
- `href: "/backtests/run_btc_1"`
- primary action `{ kind: "open_link", label: "查看验证进度", ... }`

**Step 2: Run the focused test file**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the current queue falls back to `run_validation`.

### Task 2: Implement started-validation follow-up

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Detect started validation**

In `aiRunFollowupItem()`, read the persisted `backtest` action and use `backtestRunIdsFromAction()` to identify already-started validation.

**Step 2: Return validation progress item**

Add a follow-up item before the strategy/draft fallback with:
- `actionKind: "validation_progress"`
- `title: "回测验证已启动"`
- `href` from the action or first run ID

**Step 3: Map queue labels and primary action**

Update `nextActions` and `primaryAction` mapping so `validation_progress` opens progress instead of triggering validation.

**Step 4: Verify**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`
