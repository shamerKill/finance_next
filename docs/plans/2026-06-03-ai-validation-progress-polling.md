# AI Validation Progress Polling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep AI validation results refreshing automatically while backtests are still pending or running, so the operator does not need to manually refresh after launching AI validation.

**Architecture:** Add a small pure helper in `client/data/ai-goal-preset.mjs` that classifies backtest states as terminal or still pollable. The AI Money page reuses this helper inside its existing validation-run loading effect and schedules a bounded background timeout only while at least one validation run is not terminal. This does not change backtest creation, strategy persistence, live toggles, or trading execution.

**Tech Stack:** Next.js/React frontend, TypeScript, Node test runner.

### Task 1: Polling Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Add `validationRunsNeedPolling keeps pending and running backtests live` to `client/data/ai-goal-preset.test.mjs`.

Assert:

- Empty rows return false.
- Completed (`state=3`) and failed (`state=4`) rows return false.
- Pending/running rows (`state=1` or `state=2`) return true.
- Unknown state rows return true when a run id exists.

**Step 2: Run test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `validationRunsNeedPolling` is not exported yet.

**Step 3: Implement helper**

Add:

```js
export function validationRunsNeedPolling(backtests = []) { ... }
```

Treat `3` and `4` as terminal states. Treat `1`, `2`, and unknown numeric states as still pollable if the row has a run id or state.

### Task 2: AI Money Polling

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Add `validationRunsNeedPolling` to the existing `ai-goal-preset.mjs` import list.

**Step 2: Refactor validation effect**

Replace the one-shot fetch in the `validationRunKey` effect with a `loadValidationRuns(showBusy)` function. It should:

- Fetch all validation run ids.
- Update `validationRuns`.
- Schedule `window.setTimeout(..., 5000)` only if `validationRunsNeedPolling(rows)` is true.
- Clear the timeout in cleanup.
- Keep the existing first-load busy/error behavior.

### Task 3: Verification

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
node --test client/data/auth-redirect.test.mjs
cd client
yarn typecheck
yarn lint
cd ../gateway
GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...
cd ..
git diff --check
```

Expected: all tests pass. Existing lint warning in `client/data/use-activity-center.tsx` may remain unchanged.

Implementation Checklist:
1. Add the validation progress polling plan document.
2. Add the failing polling helper test.
3. Run the target Node test and confirm RED.
4. Implement `validationRunsNeedPolling`.
5. Run the target Node test and confirm GREEN.
6. Import the helper into the AI Money page and refactor validation loading effect to poll non-terminal runs.
7. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
8. Review implementation against this plan.
