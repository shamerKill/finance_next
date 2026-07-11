# AI Thesis Invalidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI thesis invalidation panel that shows what evidence would prove the current AI money thesis wrong before the user advances a strategy.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that derives invalidators from data gaps, backtest rankings, paper candidates, market watch signals, human factors, and paper observation stop rules. Render a panel in AI Money near the sentiment/watchtower area so every AI plan includes counter-evidence, monitored signals, and stop rules. This is an observation and safety feature only; it does not change backend routes, live toggles, or trading execution.

**Tech Stack:** Next.js/React frontend, TypeScript, Node test runner.

### Task 1: Thesis Invalidation Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing tests**

Add tests for `aiThesisInvalidationFromState`:

- With no analysis, return `needs_thesis`, a `scan_today` primary action, and a guardrail saying AI cannot trade without a thesis.
- With context notes and no validation, return `data_gap`, include the notes as invalidators, and link to data explorer.
- With completed weak backtests, return `invalidated_by_backtest`, include the weak score / recommendation in invalidators, and recommend rebuilding the blueprint.
- With a paper candidate plus hot human / market pressure, return `pressure_test`, include FOMO or heat as invalidators, and include paper stop rules.
- With a clean paper candidate and balanced signals, return `watch_thesis`, include candidate backtest link, monitors, and stop rules.

**Step 2: Run target test and verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiThesisInvalidationFromState` is not exported yet.

**Step 3: Implement helper**

Add:

```js
export function aiThesisInvalidationFromState({
  analysis = null,
  validationRuns = [],
  persistedActions = [],
} = {}) { ... }
```

Return shape:

- `stage`, `tone`, `title`, `summary`
- `primaryAction`
- `metrics`
- `invalidators`
- `monitors`
- `stopRules`
- `guardrails`

Stage precedence:

1. `needs_thesis` when there is no analysis.
2. `data_gap` when context notes exist and there are no validation results.
3. `invalidated_by_backtest` when all completed validations are weak / rejected and no paper candidate exists.
4. `pressure_test` when sentiment is not balanced and sentiment review is not done.
5. `watch_thesis` when a paper candidate exists.
6. `observe` fallback.

### Task 2: AI Money UI Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper and define UI types**

Add `aiThesisInvalidationFromState` to the `ai-goal-preset.mjs` import list.

Define `AIThesisInvalidationState` near the other AI state types.

**Step 2: Build and render state**

Inside `AIMoneyPage`, build the invalidation state from `analysis`, `activeValidationRuns`, and `activeActions`.

Render `<AIThesisInvalidationPanel />` after `<AISentimentCompassPanel />` and before `<AICapitalPlanPanel />`.

**Step 3: Implement panel**

The panel should show:

- Stage badge, summary, and primary safe action.
- Metrics for thesis evidence, validation, and pressure.
- Lists for invalidators, monitored signals, stop rules, and guardrails.

Action behavior:

- `scan_today`: call `onScan`.
- `run_all_backtests`: call existing batch validation handler.
- `open_link`: render a safe link.

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

Expected: all commands pass. Existing lint warning in `client/data/use-activity-center.tsx` may remain unchanged.

Smoke:

- Start Next dev server on `127.0.0.1:3000`.
- Verify `/ai-money` redirects unauthenticated users to `/login?next=%2Fai-money`.
- Verify `/login?next=%2Fai-money` returns 200.
- Stop the dev server and verify port 3000 is closed.

Implementation Checklist:
1. Add this implementation plan document.
2. Add failing thesis invalidation helper tests.
3. Run target Node test and confirm RED.
4. Implement `aiThesisInvalidationFromState`.
5. Run target Node test and confirm GREEN.
6. Import helper and define UI types.
7. Render the thesis invalidation panel in AI Money.
8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
9. Review implementation against this plan.

## Task Progress

### 2026-06-03

- Step: 1. Add this implementation plan document.
  - Modifications: Created `docs/plans/2026-06-03-ai-thesis-invalidation.md`.
  - Change Summary: Documented the thesis invalidation helper, UI panel, verification commands, and smoke expectations.
  - Reason: Executing plan step 1.
  - Blockers: None.
  - User Confirmation Status: Pending Confirmation.
- Step: 2-3. Add failing thesis invalidation helper tests and confirm RED.
  - Modifications: Added five `aiThesisInvalidationFromState` tests in `client/data/ai-goal-preset.test.mjs`.
  - Change Summary: Covered missing thesis, data gaps, weak validation, hot pressure-test, and clean paper candidate monitoring.
  - Reason: Executing plan steps 2 and 3.
  - Blockers: None. RED was confirmed by the missing `aiThesisInvalidationFromState` export.
  - User Confirmation Status: Pending Confirmation.
- Step: 4-5. Implement `aiThesisInvalidationFromState` and confirm GREEN.
  - Modifications: Added helper and supporting text helpers in `client/data/ai-goal-preset.mjs`.
  - Change Summary: AI now derives explicit counter-evidence, monitors, stop rules, and guardrails from the current thesis, validation, sentiment, and paper plan.
  - Reason: Executing plan steps 4 and 5.
  - Blockers: None. Target Node test passed with 108 tests.
  - User Confirmation Status: Pending Confirmation.
- Step: 6-7. Import helper, define UI types, and render the panel.
  - Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx`.
  - Change Summary: Added `AIThesisInvalidationPanel` after the sentiment panel with safe scan, validation, and link actions only.
  - Reason: Executing plan steps 6 and 7.
  - Blockers: None.
  - User Confirmation Status: Pending Confirmation.
- Step: 8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
  - Modifications: No code changes from verification.
  - Change Summary: Target and regression tests passed; smoke confirmed `/ai-money` redirects to login and login returns 200.
  - Reason: Executing plan step 8.
  - Blockers: Existing lint warning remains in `client/data/use-activity-center.tsx:138`.
  - User Confirmation Status: Pending Confirmation.

## Final Review

Implementation matches the final plan. The feature is a frontend observation and safety layer only; no backend route, live toggle, order submission, or trading execution path changed.
