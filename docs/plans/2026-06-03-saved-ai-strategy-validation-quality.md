# Saved AI Strategy Validation Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent saved AI strategies from entering paper review when their completed backtests are weak or rejected.

**Architecture:** Reuse the existing `rankBacktestValidation()` scoring function as the single validation quality gate. `aiSavedStrategyHandoffFromState()` will continue to own the saved strategy detail-page handoff state, but it will only show `paper_review` when the best completed backtest is recommended as `优先 paper`.

**Tech Stack:** Next.js app helpers, Node built-in test runner, plain JavaScript module tests.

### Task 1: Add the Regression Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test near the existing `aiSavedStrategyHandoffFromState` coverage that builds a saved AI strategy with:
- `live.enabled = false`
- complete risk caps
- one safe account
- one completed backtest with negative return, weak Sharpe, and high drawdown

Assert:
- `stage` is `validation_rejected`
- `tone` is `danger`
- `primaryHref` points to the weak backtest
- `primaryAction.kind` is `review_backtest`
- `paper_watch` item is not `current`
- `nextActions` tells the operator to return to AI / redesign instead of paper

**Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "aiSavedStrategyHandoffFromState"
```

Expected: FAIL because current code promotes any completed backtest to `paper_review`.

### Task 2: Gate Saved Strategy Handoff by Backtest Quality

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Compute the best validation row**

Inside `aiSavedStrategyHandoffFromState()`, call `rankBacktestValidation(completed)` and keep the first row as the best completed validation.

**Step 2: Update the backtest and paper item state**

Use the best validation row to:
- Mark `backtest` as `done` only for `优先 paper`
- Mark `backtest` as `blocked` for `淘汰` / `失败`
- Mark `backtest` as `current` for `继续观察`
- Keep `paper_watch` as `current` only when the best row is `优先 paper`, `liveOff`, and `riskReady`

**Step 3: Add the rejected / weak-validation branch**

Before risk/account blocking, if completed backtests exist and the best validation row is not `优先 paper`, return a non-paper stage:
- `validation_rejected`
- `tone` from the best validation row, defaulting to `warning`
- summary describing score, return, drawdown, and recommendation
- primary action to review backtest evidence
- next actions focused on redesigning or refreshing the AI run

**Step 4: Preserve existing strong-backtest behavior**

Keep the existing strong-backtest test passing. A completed backtest with recommendation `优先 paper` should still produce `paper_review`.

### Task 3: Verify

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/data/ai-settings-workflow.test.mjs`

**Step 1: Run focused tests**

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "aiSavedStrategyHandoffFromState"
```

Expected: PASS.

**Step 2: Run full helper tests**

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
```

Expected: PASS.

**Step 3: Run static verification**

```bash
git diff --check
```

Expected: no whitespace errors.

Implementation Checklist:
1. Add the weak-backtest saved strategy handoff regression test.
2. Run the focused test and confirm it fails for the expected reason.
3. Update `aiSavedStrategyHandoffFromState()` to calculate best completed validation quality.
4. Update handoff item statuses so `paper_watch` is current only for `优先 paper`.
5. Add the `validation_rejected` branch for weak or failed completed validation.
6. Run focused tests.
7. Run full helper tests.
8. Run `git diff --check`.
9. Record task progress and final review in this plan file.

# Task Progress

*   2026-06-03 00:00 CST
    *   Step: 1. Add the weak-backtest saved strategy handoff regression test.
    *   Modifications: Added a regression test in `client/data/ai-goal-preset.test.mjs` covering a saved AI strategy with safe gates but weak completed validation.
    *   Change Summary: The new test expects `validation_rejected` instead of `paper_review`.
    *   Reason: Executing plan step 1.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 2. Run the focused test and confirm it fails for the expected reason.
    *   Modifications: Ran the focused Node test pattern for `aiSavedStrategyHandoffFromState`.
    *   Change Summary: The test failed because current code returned `paper_review`, proving the regression test catches the intended behavior gap.
    *   Reason: Executing plan step 2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 3-5. Gate saved strategy handoff by validation quality.
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` so saved AI strategy handoff reuses `rankBacktestValidation()`, keeps `paper_watch` current only for `优先 paper`, and returns `validation_rejected` for weak or failed validation.
    *   Change Summary: Weak saved-strategy backtests now direct the user back to AI redesign instead of paper review.
    *   Reason: Executing plan steps 3, 4, and 5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 6. Run focused tests.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "aiSavedStrategyHandoffFromState"`.
    *   Change Summary: Focused saved-strategy handoff tests passed.
    *   Reason: Executing plan step 6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 7-8. Run full helper tests and whitespace verification.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` and `git diff --check`.
    *   Change Summary: 197 helper tests passed; whitespace check passed.
    *   Reason: Executing plan steps 7 and 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan. The saved AI strategy handoff now uses the same validation ranking as AI Money, blocks weak completed backtests from entering paper review, preserves the strong-backtest paper path, and keeps the change scoped to handoff state plus regression tests. No unreported deviations were found.
