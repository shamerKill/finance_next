# AI Operator Rhythm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI operator rhythm panel that tells the user whether to scan, refresh, validate, slow down for sentiment, paper-watch, or stay paused.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that combines current analysis age, daily radar freshness, validation status, paper actions, sentiment pressure, and safety gates into one rhythm decision. Render the decision near the top of AI Money so the user sees the current operating cadence before reading detailed panels. The feature reuses existing safe actions and does not change backend routes, live toggles, or trading execution.

**Tech Stack:** Next.js/React frontend, TypeScript, Node test runner.

### Task 1: Rhythm Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing tests**

Add tests for `aiOperatorRhythmFromState`:

- With no active analysis and no fresh daily radar, return `scan_due`, a `scan_today` primary action, and guardrails saying AI will not trade.
- With an old analysis, return `refresh_due` and a `refresh_run` primary action pointing to the active run id.
- With hot sentiment / human factors and no completed sentiment review, return `slow_down` before paper adoption.
- With a validated paper candidate and a manual paper watch action, return `paper_watch` and keep execution in observation rhythm.

**Step 2: Run target test and verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiOperatorRhythmFromState` is not exported yet.

**Step 3: Implement helper**

Add:

```js
export function aiOperatorRhythmFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  dailyRadarStatus = null,
  now = new Date(),
} = {}) { ... }
```

Return shape:

- `stage`, `tone`, `title`, `summary`
- `primaryAction`
- `metrics`
- `cadence`
- `guardrails`
- `checks`

Stage precedence:

1. `scan_due` when there is no active analysis.
2. `refresh_due` when active analysis is older than 6 hours or daily radar says stale.
3. `slow_down` when sentiment is not balanced and `sentiment_review` is not done.
4. `validating` when validation runs are pending/running.
5. `validate_ready` when runnable drafts exist without validation.
6. `paper_watch` when a paper candidate exists and `paper_watch` is manual/done.
7. `paper_candidate` when a paper candidate exists but not yet adopted.
8. `observe` fallback.

### Task 2: AI Money UI Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper and define UI types**

Add `aiOperatorRhythmFromState` to the `ai-goal-preset.mjs` import list.

Define `AIOperatorRhythmState` near the other AI state types.

**Step 2: Build and render state**

Inside `AIMoneyPage`, build the rhythm state from `analysis`, `activeActions`, `activeValidationRuns`, `runs`, and `dailyRadarStatus`.

Render `<AIOperatorRhythmPanel />` after `<AICommandCenterPanel />` and before `<AIMoneyPathPanel />`.

**Step 3: Implement panel**

The panel should show:

- Stage badge, cadence, and summary.
- Primary action using existing safe handlers.
- Metrics row for freshness, validation, and sentiment.
- Guardrails and checks.

Action behavior:

- `scan_today`: call `onScan`.
- `refresh_run`: call `onRefreshRun` for the matching active run id.
- `run_all_backtests`: call existing batch validation handler.
- `accept_paper_candidate`: call existing paper adoption handler.
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
2. Add failing rhythm helper tests.
3. Run target Node test and confirm RED.
4. Implement `aiOperatorRhythmFromState`.
5. Run target Node test and confirm GREEN.
6. Import helper and define UI types.
7. Render the operator rhythm panel in AI Money.
8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
9. Review implementation against this plan.

## Task Progress

### 2026-06-03

- Step: 1. Add this implementation plan document.
  - Modifications: Created `docs/plans/2026-06-03-ai-operator-rhythm.md`.
  - Change Summary: Documented the rhythm helper, UI panel, verification commands, and smoke expectations.
  - Reason: Executing plan step 1.
  - Blockers: None.
  - User Confirmation Status: Pending Confirmation.
- Step: 2-3. Add failing rhythm helper tests and confirm RED.
  - Modifications: Added four `aiOperatorRhythmFromState` tests in `client/data/ai-goal-preset.test.mjs`.
  - Change Summary: Covered scan due, stale refresh, heated sentiment slowdown, and adopted paper observation rhythm.
  - Reason: Executing plan steps 2 and 3.
  - Blockers: None. RED was confirmed by the missing `aiOperatorRhythmFromState` export.
  - User Confirmation Status: Pending Confirmation.
- Step: 4-5. Implement `aiOperatorRhythmFromState` and confirm GREEN.
  - Modifications: Added rhythm helper and small formatting helpers in `client/data/ai-goal-preset.mjs`.
  - Change Summary: AI now derives a single operating cadence from analysis freshness, daily radar status, validation, sentiment, paper watch, and safety boundaries.
  - Reason: Executing plan steps 4 and 5.
  - Blockers: None. Target Node test passed with 103 tests.
  - User Confirmation Status: Pending Confirmation.
- Step: 6-7. Import helper, define UI types, and render the panel.
  - Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx`.
  - Change Summary: Added `AIOperatorRhythmPanel` below the AI command center with cadence, metrics, checks, guardrails, and existing safe actions.
  - Reason: Executing plan steps 6 and 7.
  - Blockers: None.
  - User Confirmation Status: Pending Confirmation.
- Step: 8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
  - Modifications: No code changes from verification.
  - Change Summary: Target and regression tests passed; smoke confirmed `/ai-money` redirects to login and login returns 200. Browser plugin local navigation was blocked by environment policy while curl succeeded.
  - Reason: Executing plan step 8.
  - Blockers: Existing lint warning remains in `client/data/use-activity-center.tsx:138`.
  - User Confirmation Status: Pending Confirmation.

## Final Review

Implementation matches the final plan. No backend routes, live toggles, or trading execution paths were changed. The new rhythm panel only calls existing safe scan, refresh, validation, paper adoption, and link actions.
