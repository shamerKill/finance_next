# AI Money Started Validation Follow-up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI Money from suggesting duplicate backtests when a historical AI run already started validation and the backtest results are still loading or pending.

**Architecture:** Keep the decision in `nextAIGoalDecision` because every AI Money panel already consumes that helper. When the persisted `backtest` action is `done` and contains backtest run IDs, treat the workflow as `validating` until actual validation rows are available.

**Tech Stack:** Node test runner, existing AI Money pure helper module.

### Task 1: Add RED coverage for started validation

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing tests**

Add tests showing that `nextAIGoalDecision` and `aiNowActionFromState` open an existing backtest when the `backtest` action already stores a related run ID.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "started validation"`

Expected: FAIL because the current helper still returns `run_all_backtests`.

### Task 2: Recognize started validation in the decision helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Implement minimal helper change**

Inside `nextAIGoalDecision`, read the persisted `backtest` action and use `backtestRunIdsFromAction`. If the action is `done`, has IDs, and no validation rows have loaded yet, return a `validating` decision with an `open_link` primary action to the first existing backtest.

**Step 2: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "started validation"`

Expected: PASS.

### Task 3: Verify helper suite and client checks

**Files:**
- No code changes expected.

**Step 1: Run helper tests**

Run: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`

Expected: PASS.

**Step 2: Run client typecheck and lint**

Run in `client`: `yarn typecheck`

Expected: PASS.

Run in `client`: `yarn lint`

Expected: exit 0. Existing unrelated warning in `client/data/use-activity-center.tsx` may remain.

**Step 3: Run diff whitespace check**

Run: `git diff --check`

Expected: PASS.

# Task Progress

* 2026-06-03 07:51:44 CST
  * Step: Task 1 - Add RED coverage for started validation
  * Modifications: Added tests for `nextAIGoalDecision` and `aiNowActionFromState` when a persisted `backtest` action already stores a started run ID.
  * Change Summary: The RED tests showed the helper still returned `backtest` / duplicate batch validation.
  * Reason: Executing plan Task 1.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:51:44 CST
  * Step: Task 2 - Recognize started validation in the decision helper
  * Modifications: `nextAIGoalDecision` now reads the done `backtest` action, extracts existing run IDs, and returns a `validating` decision with an `open_link` primary action when results have not loaded yet.
  * Change Summary: AI Money opens or waits for already-started validation instead of asking the user to run duplicate backtests.
  * Reason: Executing plan Task 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:51:44 CST
  * Step: Task 3 - Verify helper suite and client checks
  * Modifications: No code changes.
  * Change Summary: Focused RED/GREEN, full helper tests, typecheck, lint, and diff whitespace checks were run.
  * Reason: Executing plan Task 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. The decision helper now distinguishes “no validation exists” from “validation already started but results are not loaded,” keeping the AI workflow moving forward without duplicate backtest creation. No unreported deviations were found.
