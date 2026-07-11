# AI Money Redesign Primary Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn weak completed validation into an AI-led redesign action so the user can rerun strategy generation without manually interpreting failed backtest metrics.

**Architecture:** Keep the decision in pure helpers. `nextAIGoalDecision` marks weak validation with an `analyze_and_validate` primary action, `aiDailyMissionFromState` turns it into a high-priority task, and `aiNowActionFromState` exposes it as the main AI-owned button.

**Tech Stack:** Node test runner, existing AI Money helper module, existing AI Money panel button handling.

### Task 1: Add RED coverage for weak-validation redesign action

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing tests**

Add tests showing that weak completed validation returns an `analyze_and_validate` primary action in `nextAIGoalDecision`, `aiDailyMissionFromState`, and `aiNowActionFromState`.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "weak validation redesign"`

Expected: FAIL because current helpers expose no AI redesign primary action.

### Task 2: Wire redesign into mission and now-action helpers

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Implement minimal helper change**

Add `{ kind: "analyze_and_validate", label: "让 AI 重做蓝图" }` to the weak-validation `redesign` decision. Convert it to a high-priority mission task and preserve it through `nowActionOwner` / `nowActionPrimaryFromTask`.

**Step 2: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "weak validation redesign"`

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

* 2026-06-03 07:56:16 CST
  * Step: Task 1 - Add RED coverage for weak-validation redesign action
  * Modifications: Added tests for `nextAIGoalDecision`, `aiDailyMissionFromState`, and `aiNowActionFromState` when completed validation is weak.
  * Change Summary: The RED tests showed weak validation fell through to `review_gates` / `scan_today` and lacked an AI redesign primary action.
  * Reason: Executing plan Task 1.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:56:16 CST
  * Step: Task 2 - Wire redesign into mission and now-action helpers
  * Modifications: Added an `analyze_and_validate` primary action to weak-validation `redesign`, mapped it into a high-priority mission task, and preserved AI ownership through now-action helpers.
  * Change Summary: Weak completed backtests now become a direct “让 AI 重做蓝图” button instead of asking the user to interpret failed metrics manually.
  * Reason: Executing plan Task 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:56:16 CST
  * Step: Task 3 - Verify helper suite and client checks
  * Modifications: No code changes.
  * Change Summary: Focused RED/GREEN, full helper tests, typecheck, lint, and diff whitespace checks were run.
  * Reason: Executing plan Task 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. Weak completed validation now drives an AI-owned redesign action across decision, daily mission, and current task helpers. No unreported deviations were found.
