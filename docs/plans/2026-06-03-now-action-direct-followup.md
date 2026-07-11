# Now Action Direct Followup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Money current-task primary button directly trigger historical AI run validation or refresh actions.

**Architecture:** Keep action selection in `client/data/ai-goal-preset.mjs`, then wire the existing `validateRun` and `refreshRun` callbacks into `AINowActionPanel`. This avoids inventing new backend behavior and keeps execution inside existing safe validation/refresh paths.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Update the follow-up validation test**

Change the existing `aiNowActionFromState opens follow-up validation instead of rescanning` expectation:

- `stage` should be `validate_run`
- `primaryAction.kind` should be `validate_run`
- `primaryAction.runId` should be the historical run id

**Step 2: Run focused test**

Run: `node --test --test-name-pattern "opens follow-up validation" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because current helper returns `open_link`.

### Task 2: Implement Direct Helper Action

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1:** Treat `validate_run` and `refresh_run` as AI-owned actions.

**Step 2:** Return direct primary actions for `validate_run` and `refresh_run`, preserving `runId` and `href`.

### Task 3: Wire UI Button

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Add `runs`, `runsBusy`, `onValidateRun`, and `onRefreshRun` props to `AINowActionPanel`.

**Step 2:** In the primary button branch, handle `validate_run` and `refresh_run` by finding the referenced run and calling the existing callback.

### Task 4: Verify

**Step 1:** Run focused test.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 4:** Run `git diff --check`.

## Execution Notes

**2026-06-03**

- RED confirmed with `node --test --test-name-pattern "opens follow-up validation" client/data/ai-goal-preset.test.mjs`: failed because `aiNowActionFromState` still returned `open_link` instead of `validate_run`.
- GREEN confirmed with `node --test --test-name-pattern "opens follow-up validation" client/data/ai-goal-preset.test.mjs`: 1 test passed, 0 failed.
- Type correction: initial UI wiring added `runId` to the wrong primary action type. `yarn typecheck` failed at `client.tsx:2592`; after adding `runId`/`href` to `AINowActionState.primaryAction`, `yarn typecheck` passed.
- Full AI helper verification confirmed with `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 170 tests passed, 0 failed.
- Client lint verification confirmed with `yarn lint`: exited 0 with the pre-existing warning in `client/data/use-activity-center.tsx:138`.
- Diff whitespace verification confirmed with `git diff --check`: passed.
