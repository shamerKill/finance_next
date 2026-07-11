# AI Money Now Action Scan Form State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the "AI 自动生成目标并验证" button executes the exact AI-generated target shown in the current-task proposal card.

**Architecture:** Add `scanFormState` to the idle `aiNowActionFromState` result, using the same object as the displayed `proposedFormState`. Update `AINowActionPanel` and `onDailyRadarScan` so scan actions can accept and submit that explicit form state instead of regenerating a possibly different target.

**Tech Stack:** ESM helper functions, Node test runner, Next.js React client component, existing AI Money analyze-and-validate pipeline.

### Task 1: RED tests for scan form state

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Update idle now-action test**

Add expectations that idle `aiNowActionFromState` returns `scanFormState` and that it uses the same goal, symbols, and execution mode as `proposedFormState`.

**Step 2: Update memory proposal test**

Add expectations that memory-based `scanFormState` uses the same deduped symbols and paper-only execution as the visible proposal.

**Step 3: Run focused RED test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`

Expected: FAIL because `scanFormState` is currently missing.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Attach scan form state**

In the no-analysis branch of `aiNowActionFromState`, set `scanFormState: task?.proposedFormState`.

**Step 2: Allow scan callback to accept a form state**

Change `onDailyRadarScan` to accept an optional `AIGoalFormState`. If provided, apply and submit it; otherwise keep the existing `dailyRadarFormStateFromRuns(runs)` fallback.

**Step 3: Use scan form state in current task panel**

Change `AINowActionPanel`'s `onScan` prop type to accept an optional form state. In the scan/rescan button, call `onScan(state.scanFormState ?? state.proposedFormState)`.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`
- Review: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Run focused GREEN test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning.

Implementation Checklist:
1. Update idle now-action RED test for `scanFormState`.
2. Update memory proposal RED test for `scanFormState`.
3. Run focused RED test and confirm failure.
4. Attach `scanFormState` to idle now action.
5. Update `onDailyRadarScan` to accept explicit form state.
6. Update `AINowActionPanel` scan button to pass explicit form state.
7. Run focused and full verification.
8. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "8. Append task progress and final review to this plan."

# Task Progress
*   [2026-06-03 08:32:11 CST]
    *   Step: 1-2. RED tests for scan form state
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` so idle and memory-based now-action states must expose `scanFormState` matching the displayed `proposedFormState`.
    *   Change Summary: Added regression coverage that the action state carries the exact target the UI displays.
    *   Reason: Executing plan steps 1-2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:32:11 CST]
    *   Step: 3. Run focused RED test and confirm failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`; the focused tests failed because `scanFormState` was undefined.
    *   Change Summary: Confirmed the missing explicit scan form state.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:35:58 CST]
    *   Step: 4. Attach `scanFormState` to idle now action
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` so the no-analysis `aiNowActionFromState` result exposes `scanFormState: task?.proposedFormState`.
    *   Change Summary: The now-action state now carries the exact target displayed in the AI-generated proposal card.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:35:58 CST]
    *   Step: 5. Update `onDailyRadarScan` to accept explicit form state
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` so `onDailyRadarScan(targetFormState?: AIGoalFormState)` applies a supplied form state before submitting, while preserving the existing fallback when no target is passed.
    *   Change Summary: Scan actions can now submit a caller-provided AI target instead of always regenerating one from current runs.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:35:58 CST]
    *   Step: 6. Update `AINowActionPanel` scan button to pass explicit form state
    *   Modifications: Updated `AINowActionState` and the `AINowActionPanel` scan/rescan button so it calls `onScan(state.scanFormState ?? state.proposedFormState)`.
    *   Change Summary: Clicking "AI 自动生成目标并验证" now uses the exact displayed proposal target.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:35:58 CST]
    *   Step: 7. Run focused and full verification
    *   Modifications: Ran focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan for touched files.
    *   Change Summary: Focused and full helper tests passed; typecheck passed; lint exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks passed.
    *   Reason: Executing plan step 7
    *   Blockers: Browser render remains blocked by the current auth/gateway state for `/ai-money`; no dev server left running.
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:35:58 CST]
    *   Step: 8. Append task progress and final review to this plan
    *   Modifications: Updated this plan with GREEN progress, verification evidence, and final review.
    *   Change Summary: Documentation now reflects the completed scan-form-state increment.
    *   Reason: Executing plan step 8
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

Checklist verification:
1. `client/data/ai-goal-preset.test.mjs` includes RED coverage that idle now-action output exposes `scanFormState` matching the visible `proposedFormState`.
2. `client/data/ai-goal-preset.test.mjs` includes RED coverage that memory-based proposals keep deduped symbols and paper execution in `scanFormState`.
3. The focused RED command failed before implementation because `scanFormState` was missing.
4. `client/data/ai-goal-preset.mjs` attaches `scanFormState` to the idle now-action result from the same `task?.proposedFormState` object used for the visible proposal.
5. `client/app/(dashboard)/ai-money/client.tsx` allows `onDailyRadarScan` to accept an explicit `AIGoalFormState` and preserves the old fallback path.
6. `client/app/(dashboard)/ai-money/client.tsx` passes `state.scanFormState ?? state.proposedFormState` from the now-action scan/rescan button.
7. Verification commands passed as planned, except browser rendering could not be completed because `/ai-money` currently requires a valid gateway-authenticated session.
8. No unreported deviations were found.
