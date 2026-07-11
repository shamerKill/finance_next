# AI Redesign Target From Weak Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When AI validation is weak, make the "让 AI 重做蓝图" action submit a concrete safer redesign target that includes the failed metrics, market/human constraints, and paper-only guardrail.

**Architecture:** Add a small frontend helper in `client/data/ai-goal-preset.mjs` that converts weak validation evidence into an `AIGoalFormState`-compatible object. Attach that object to the redesign mission and now-action state, then update the AI Money primary action callback so `analyze_and_validate` can submit the explicit form state just like daily scans do.

**Tech Stack:** ESM helper functions, Node test runner, Next.js React client component, existing AI Money analysis-and-validation pipeline.

### Task 1: RED tests for weak-validation redesign target

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Update daily mission weak-validation test**

Add assertions to `aiDailyMissionFromState makes weak validation redesign an AI primary task`:
- `mission.tasks[0].proposedFormState.goal` includes `重做`, `淘汰`, `回测`, `市场风向`, `人性偏差`, and `paper 验证`.
- `mission.tasks[0].proposedFormState.executionMode` is `paper`.
- `mission.tasks[0].proposedFormState.riskPreference` is `conservative`.

**Step 2: Update now-action weak-validation test**

Add assertions to `aiNowActionFromState turns weak validation into an AI redesign button`:
- `now.proposedFormState.goal === now.scanFormState.goal`.
- `now.proposalCard.goal === now.proposedFormState.goal`.
- `now.proposedFormState.goal` includes the failed strategy id and drawdown evidence.
- `now.primaryAction.kind` remains `analyze_and_validate`.

**Step 3: Run focused RED test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'weak validation|redesign'`

Expected: FAIL because weak-validation redesign tasks do not expose `proposedFormState` or `proposalCard` yet.

### Task 2: GREEN helper implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add symbol extraction helper**

Add a local helper that derives display symbols from `analysis.context.symbols` and `analysis.strategyDrafts[].symbol`, stripping a trailing `USDT` for readability and falling back to `BTC, ETH, SOL`.

**Step 2: Add redesign form-state helper**

Add a local `redesignFormStateFromWeakValidation(analysis, rankedRows, decision)` helper that returns:
- `goal`: a Chinese instruction for AI to redo the blueprint based on failed backtest evidence, lower risk, market direction, news/public sentiment, human bias, and paper-only verification.
- `symbolsText`: derived symbols.
- `horizon`: `24h-7d`.
- `riskPreference`: `conservative`.
- `executionMode`: `paper`.
- `behaviorText`, `narrativeText`, `avoidText`: reuse `analysis.context.operatorConstraints` when present, otherwise current safe defaults.

**Step 3: Attach redesign form state to mission task**

In the `decision.primaryAction.kind === "analyze_and_validate"` branch of `aiDailyMissionFromState`, compute the redesign form state and add it to the task as `proposedFormState`.

**Step 4: Attach redesign form state to now-action state**

In the analyzed branch of `aiNowActionFromState`, expose `proposedFormState`, `scanFormState`, and `proposalCard` when the actionable task has `proposedFormState`.

### Task 3: Wire analyze action to explicit form state

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Update analyze callback**

Change `onAnalyzeAndValidate` to accept `targetFormState?: AIGoalFormState`. When provided, apply that form state and build the payload from it; otherwise keep the existing `currentFormState()` path.

**Step 2: Update now-action analyze button**

In `AINowActionPanel`, change the `analyze_and_validate` button to call `onAnalyzeAndValidate(state.scanFormState ?? state.proposedFormState)`.

**Step 3: Update prop type**

Change `AINowActionPanel`'s `onAnalyzeAndValidate` prop to `(next?: AIGoalFormState) => void`. Leave other no-argument panels unchanged if TypeScript accepts the optional-argument callback.

### Task 4: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`
- Review: `client/app/(dashboard)/ai-money/client.tsx`
- Update: this plan file

**Step 1: Run focused GREEN test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'weak validation|redesign'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`
- `rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs 'client/app/(dashboard)/ai-money/client.tsx' docs/plans/2026-06-03-ai-redesign-target-from-weak-validation.md`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks pass.

Implementation Checklist:
1. Add RED expectations to the daily mission weak-validation test.
2. Add RED expectations to the now-action weak-validation test.
3. Run the focused RED test and confirm expected failure.
4. Add symbol extraction and weak-validation redesign form-state helpers.
5. Attach redesign `proposedFormState` to the daily mission task.
6. Attach redesign `proposedFormState`, `scanFormState`, and `proposalCard` to now-action state.
7. Update `onAnalyzeAndValidate` to accept an explicit form state.
8. Update `AINowActionPanel` analyze button to submit the explicit form state.
9. Run focused and full verification.
10. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "10. Append task progress and final review to this plan."

# Task Progress
*   [2026-06-03 08:42:58 CST]
    *   Step: 1-2. Add RED expectations for weak-validation redesign target
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` so weak validation must expose a safer `proposedFormState`, matching `scanFormState` and the proposal card.
    *   Change Summary: Tests now require the "让 AI 重做蓝图" path to carry failed metrics, redesign wording, market direction, human-bias review, and paper-only execution.
    *   Reason: Executing plan steps 1-2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 3. Run focused RED test and confirm expected failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'weak validation|redesign'`; it failed because `proposedFormState` / `proposalCard` were missing.
    *   Change Summary: Confirmed the regression tests catch the missing explicit redesign target.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 4. Add symbol extraction and weak-validation redesign form-state helpers
    *   Modifications: Added local helpers in `client/data/ai-goal-preset.mjs` to derive readable symbols and build a conservative paper-only redesign target from weak backtest evidence.
    *   Change Summary: Weak validation evidence is now converted into an AI-ready target with failed metrics and safer constraints.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 5. Attach redesign `proposedFormState` to the daily mission task
    *   Modifications: Updated the `analyze_and_validate` branch in `aiDailyMissionFromState` to attach the generated redesign form state when the decision stage is `redesign`.
    *   Change Summary: The daily mission now carries the actual AI target that should be submitted after weak validation.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 6. Attach redesign `proposedFormState`, `scanFormState`, and `proposalCard` to now-action state
    *   Modifications: Updated the analyzed branch of `aiNowActionFromState` to expose the actionable task's form state and proposal card.
    *   Change Summary: The current-task panel can now show and execute the exact weak-validation redesign target.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 7-8. Wire analyze action to explicit form state
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` so `onAnalyzeAndValidate(targetFormState?: AIGoalFormState)` applies and submits a supplied form state, and the `AINowActionPanel` analyze button passes `state.scanFormState ?? state.proposedFormState`.
    *   Change Summary: Clicking "让 AI 重做蓝图" now submits the displayed safer redesign target instead of the stale current form.
    *   Reason: Executing plan steps 7-8
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 9. Run focused and full verification
    *   Modifications: Ran the focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan for touched files.
    *   Change Summary: Focused and full helper tests passed; typecheck passed; lint exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks passed.
    *   Reason: Executing plan step 9
    *   Blockers: Browser render was not rerun because `/ai-money` currently requires a valid gateway-authenticated session.
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:42:58 CST]
    *   Step: 10. Append task progress and final review to this plan
    *   Modifications: Updated this plan with RED/GREEN progress, verification evidence, and final review.
    *   Change Summary: Documentation now reflects the completed weak-validation redesign-target increment.
    *   Reason: Executing plan step 10
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

Checklist verification:
1. `client/data/ai-goal-preset.test.mjs` includes RED coverage for daily mission weak-validation `proposedFormState`.
2. `client/data/ai-goal-preset.test.mjs` includes RED coverage for now-action `scanFormState` and `proposalCard`.
3. The focused RED command failed before implementation because the explicit redesign target was missing.
4. `client/data/ai-goal-preset.mjs` derives readable symbols and builds a conservative paper-only redesign target from failed validation rows.
5. `aiDailyMissionFromState` attaches the redesign `proposedFormState` to the `redesign_blueprint` task.
6. `aiNowActionFromState` exposes the same form state as `proposedFormState`, `scanFormState`, and `proposalCard`.
7. `client/app/(dashboard)/ai-money/client.tsx` allows `onAnalyzeAndValidate` to accept an explicit form state.
8. `AINowActionPanel` submits the explicit form state for `analyze_and_validate`.
9. Focused and full verification passed, with only the known unrelated lint warning.
10. No unreported deviations were found.
