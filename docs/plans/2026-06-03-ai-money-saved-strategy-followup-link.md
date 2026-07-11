# AI Money Saved Strategy Follow-up Link Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an AI run has already saved a strategy draft and still needs backtest evidence, route the primary follow-up action directly to the saved strategy instead of reopening the AI run first.

**Architecture:** Keep `aiRunFollowupQueueFromRuns` as the source of truth for historical run follow-ups. Add an `open_link` primary action for `saved_strategy_backtest`, then let `aiDailyMissionFromState` and `aiNowActionFromState` pass that action through to the UI.

**Tech Stack:** ESM helper functions, Node test runner, Next.js client action rendering already supports `open_link`.

### Task 1: RED tests for saved strategy direct link

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Update follow-up queue test**

Change the saved strategy follow-up test to expect:
- `queue.primaryAction.kind === "open_link"`
- label `打开已保存策略`
- href `/strategies/opt123?from=ai-draft&aiRunId=goal_saved`

**Step 2: Add daily mission test**

Add a no-active-analysis daily mission test proving the task has `actionKind === "open_link"` and uses the saved strategy href.

**Step 3: Add now action test**

Add a no-active-analysis now action test proving the top button opens the saved strategy link directly.

**Step 4: Run focused test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'saved AI strategies|saved strategy follow-up|saved strategy backtest'`

Expected: FAIL because the current primary action is `open_run`.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Return open-link primary action for saved strategy follow-up**

In `aiRunFollowupQueueFromRuns`, map `top.actionKind === "saved_strategy_backtest"` to `{ kind: "open_link", label: "打开已保存策略", runId, href: top.href || aiMoneyRunHref(runId) }`.

**Step 2: Preserve open_link in daily mission**

In `aiDailyMissionFromState`, pass `followupAction.kind === "open_link"` through as `actionKind: "open_link"`.

**Step 3: Verify now action uses existing open_link mapping**

No UI change should be needed because `nowActionPrimaryFromTask` and `AINowActionPanel` already support `open_link`.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`

**Step 1: Run focused test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'saved AI strategies|saved strategy follow-up|saved strategy backtest'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `use-activity-center.tsx` warning.

Implementation Checklist:
1. Update saved strategy follow-up queue test.
2. Add saved strategy daily mission test.
3. Add saved strategy now action test.
4. Run focused RED test and confirm failure.
5. Map saved strategy follow-up to `open_link`.
6. Preserve `open_link` in daily mission follow-up actions.
7. Run focused and full verification.
8. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "Final review completed."

# Task Progress
*   [2026-06-03 08:18:29 CST]
    *   Step: 1-3. RED tests for saved strategy direct link
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` to require the saved-strategy follow-up queue, daily mission, and now action to open the saved strategy href directly.
    *   Change Summary: Added regression coverage for direct saved-strategy follow-up navigation.
    *   Reason: Executing plan steps 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:18:29 CST]
    *   Step: 4. Run focused RED test and confirm failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'saved AI strategies|saved strategy follow-up|saved strategy backtest'`; the three new expectations failed because the current implementation returned `open_run`.
    *   Change Summary: Confirmed the tests fail for the intended missing behavior.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:19:27 CST]
    *   Step: 5. Map saved strategy follow-up to `open_link`
    *   Modifications: Updated `aiRunFollowupQueueFromRuns` in `client/data/ai-goal-preset.mjs` so `saved_strategy_backtest` returns `{ kind: "open_link", label: "打开已保存策略", runId, href }`.
    *   Change Summary: Historical AI runs with saved strategies now send the primary action directly to the saved strategy href.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:19:27 CST]
    *   Step: 6. Preserve `open_link` in daily mission follow-up actions
    *   Modifications: Updated `aiDailyMissionFromState` so a follow-up queue `open_link` primary action remains `actionKind: "open_link"` in the daily mission task.
    *   Change Summary: The daily mission and now action can use the saved strategy direct link instead of reopening the AI run.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:19:27 CST]
    *   Step: 7. Run focused and full verification
    *   Modifications: Ran focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan.
    *   Change Summary: Focused tests passed; full helper test suite passed 180/180; typecheck passed; lint exited 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning; diff check passed; trailing-whitespace scan had no matches.
    *   Reason: Executing plan step 7
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The implementation completed the planned `saved_strategy_backtest` to `open_link` mapping in `aiRunFollowupQueueFromRuns`, preserved `open_link` inside `aiDailyMissionFromState`, and relied on the existing now-action and UI support for `open_link` as specified. No unreported deviations were found.
