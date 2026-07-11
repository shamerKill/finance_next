# AI Followup Validation Results Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let historical AI run follow-up read completed validation results and choose redesign or paper-ready next steps automatically.

**Architecture:** Extend `aiRunFollowupQueueFromRuns()` with an optional `validationRuns` argument. When a run has a completed `backtest` action, match its recorded backtest run IDs to current validation rows, rank them with `rankBacktestValidation()`, and promote weak validation to an executable AI redesign action. `aiDailyMissionFromState()` and `aiNowActionFromState()` already use the follow-up queue when there is no active analysis, so passing validation rows through that path makes the main one-click action smarter.

**Tech Stack:** Next.js helper module, Node built-in test runner, plain JavaScript tests.

### Task 1: Add Regression Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write a queue-level failing test**

Add a test near existing `aiRunFollowupQueueFromRuns` tests:
- one historical run with a `backtest` action marked `done`, related to `run_btc_1`
- one completed validation run `run_btc_1` with weak metrics

Assert:
- queue top item `actionKind` is `redesign_validation`
- queue primary action is `analyze_and_validate`
- primary action carries `proposedFormState`
- proposed goal includes the old run goal and weak validation evidence

**Step 2: Write a now-action failing test**

Add a test near `aiNowActionFromState` no-analysis tests:
- no active analysis
- one historical run with completed weak validation result

Assert:
- `stage` is `analyze_and_validate`
- `primaryAction.kind` is `analyze_and_validate`
- `scanFormState` carries the redesign goal

**Step 3: Run focused tests to verify failure**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "completed weak validation"
```

Expected: FAIL because current follow-up ignores validation rows and keeps returning `validation_progress`.

### Task 2: Implement Validation-Aware Followup

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Thread validation rows into follow-up queue**

Update:
- `aiRunFollowupItem(run, now, validationRuns = [])`
- `aiRunFollowupQueueFromRuns(runs = [], now = new Date(), validationRuns = [])`

Keep existing two-argument calls working.

**Step 2: Build a run-backed redesign analysis**

When a historical run has `analysis`, use it. Otherwise create a minimal analysis shape from run goal, symbols, horizon, risk preference, execution mode, and context counts.

**Step 3: Detect completed weak validation**

For `startedBacktestRunIds`, find matching validation rows, rank them with `rankBacktestValidation()`, and when the best completed row is not `优先 paper`, return a high-priority `redesign_validation` item with `proposedFormState`.

**Step 4: Expose executable primary action**

Map `redesign_validation` to:

```js
{
  kind: "analyze_and_validate",
  label: "让 AI 重做此运行",
  runId,
  href: aiMoneyRunHref(runId),
  proposedFormState,
}
```

Then update `aiDailyMissionFromState()` no-analysis branch so follow-up tasks preserve `proposedFormState` and use `actionKind: "analyze_and_validate"` for this case.

### Task 3: Verify

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/data/ai-settings-workflow.test.mjs`

**Step 1: Run focused tests**

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "completed weak validation"
```

Expected: PASS.

**Step 2: Run full helper tests**

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
```

Expected: PASS.

**Step 3: Run whitespace verification**

```bash
git diff --check
```

Expected: no whitespace errors.

Implementation Checklist:
1. Add the queue-level completed weak validation regression test.
2. Add the now-action completed weak validation regression test.
3. Run focused tests and confirm they fail for the expected reason.
4. Thread validation rows through follow-up queue inputs.
5. Add minimal run-backed analysis construction for redesign prompts.
6. Add weak completed validation detection and `redesign_validation` queue item.
7. Map `redesign_validation` to an executable `analyze_and_validate` action.
8. Pass validation rows through `aiDailyMissionFromState()` no-analysis branch and preserve proposed form state in tasks.
9. Run focused tests.
10. Run full helper tests.
11. Run `git diff --check`.
12. Record task progress and final review in this plan file.

# Task Progress

*   2026-06-03 00:00 CST
    *   Step: 1-2. Add completed weak validation regression tests.
    *   Modifications: Added queue-level and now-action tests in `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Tests require historical completed weak validation to become an executable AI redesign action with proposed form state.
    *   Reason: Executing plan steps 1 and 2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 3. Run focused tests and confirm they fail for the expected reason.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "completed weak validation"`.
    *   Change Summary: Focused tests failed because current code returned `validation_progress` / `open_link` instead of `redesign_validation` / `analyze_and_validate`.
    *   Reason: Executing plan step 3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 4-8. Implement validation-aware followup.
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` to thread validation rows into AI run follow-up, match completed started backtests, generate redesign prompts from historical run context, map weak completed validation to `redesign_validation`, and preserve `proposedFormState` through daily mission / now action primary actions.
    *   Change Summary: Historical weak validation no longer leaves the user at "查看验证进度"; it becomes a one-click AI redesign action.
    *   Reason: Executing plan steps 4 through 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 9-11. Run focused tests, full helper tests, typecheck, and whitespace verification.
    *   Modifications: Ran focused Node tests, `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`, `yarn typecheck` in `client/`, and `git diff --check`.
    *   Change Summary: Focused tests passed; 199 helper tests passed; TypeScript passed; whitespace check passed.
    *   Reason: Executing plan steps 9 through 11.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan. Historical AI runs with completed weak validation now produce a high-priority AI redesign follow-up, including failed backtest evidence and prior human / market context. The no-analysis Daily Mission and Now Action paths preserve the proposed form state so the user can continue with one AI action instead of manually interpreting validation progress. No unreported deviations were found.
