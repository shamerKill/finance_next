# AI Strategy Shortlist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI strategy shortlist that ranks generated strategy drafts, validation results, paper candidates, and watch-only drafts into a single operator-friendly queue.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that combines `strategyDrafts`, `rankBacktestValidation`, and `backtestRequestFromDraft` into ranked shortlist rows. The AI Money analysis result renders those rows above the action queue, so the operator can immediately see which draft to validate, paper-watch, keep observing, or reject. No backend routes, live toggles, or trading execution paths change.

**Tech Stack:** Next.js/React frontend, TypeScript, Node test runner.

### Task 1: Shortlist Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing tests**

Add tests for `aiStrategyShortlistFromState`:

- With runnable and watch-only drafts but no validation, runnable drafts are marked `validate_ready`, watch-only drafts are marked `observe_only`, and the primary action is `run_all_backtests`.
- With completed validation runs, the highest-scoring `优先 paper` draft sorts first as `paper_candidate`; weak completed runs are marked `rejected`.
- With a running validation run, the matching draft is marked `validating` and points to the backtest detail.

**Step 2: Run target test and verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiStrategyShortlistFromState` is not exported yet.

**Step 3: Implement helper**

Add:

```js
export function aiStrategyShortlistFromState({
  analysis = null,
  validationRuns = [],
} = {}) { ... }
```

Return shape:

- `stage`, `tone`, `title`, `summary`
- `primaryAction`
- `metrics`
- `items: [{ draftName, symbol, kind, stage, tone, rank, score, recommendation, actionKind, actionLabel, href, backtestHref, strategyHref, reasons, blockers }]`
- `guardrails`, `nextChecks`

Sorting:

- `paper_candidate` first by score desc.
- `validating`, then `validate_ready`, then `watch`, then `observe_only`.
- `rejected` last.

### Task 2: AI Money UI Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper and define UI types**

Add `aiStrategyShortlistFromState` to the `ai-goal-preset.mjs` import list.

Define `AIStrategyShortlistState` and `AIStrategyShortlistItem` near the other AI state types.

**Step 2: Build and render state**

Inside `AnalysisResult`, build the shortlist from `analysis` and `validationRuns`.

Render `<AIStrategyShortlistPanel />` after `<DecisionCard />` and before `<ActionQueue />`.

**Step 3: Implement panel**

The panel should show:

- Stage badge and short summary.
- Metrics row for paper candidates, validating rows, and ready-to-validate rows.
- Shortlist cards with rank, stage, score, reasons, blockers, and an action button/link.
- Guardrails and next checks.

Action behavior:

- `run_all_backtests`: call the existing batch validation handler.
- `run_backtest`: call the existing single draft backtest handler.
- `accept_paper_candidate`: call the existing paper adoption handler when a matching candidate exists.
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

Expected: all tests pass. Existing lint warning in `client/data/use-activity-center.tsx` may remain unchanged.

Smoke:

- Start Next dev server on `127.0.0.1:3000`.
- Verify `/ai-money` redirects unauthenticated users to `/login?next=%2Fai-money`.
- Stop the dev server and verify port 3000 is closed.

Implementation Checklist:
1. Add this implementation plan document.
2. Add failing shortlist helper tests.
3. Run target Node test and confirm RED.
4. Implement `aiStrategyShortlistFromState`.
5. Run target Node test and confirm GREEN.
6. Import helper and define UI types.
7. Render the strategy shortlist panel in AI Money analysis results.
8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
9. Review implementation against this plan.

## Task Progress

### 2026-06-03

- Step: 1. Add this implementation plan document.
  - Modifications: Created `docs/plans/2026-06-03-ai-strategy-shortlist.md`.
  - Change Summary: Documented the helper, UI panel, verification commands, and smoke expectations.
  - Reason: Executing plan step 1.
  - Blockers: None.
  - User Confirmation Status: Pending Confirmation.
- Step: 2-3. Add failing shortlist helper tests and confirm RED.
  - Modifications: Added three `aiStrategyShortlistFromState` tests in `client/data/ai-goal-preset.test.mjs`.
  - Change Summary: Covered ready-to-validate drafts, paper candidates, rejected validation, running validation, and watch-only drafts.
  - Reason: Executing plan steps 2 and 3.
  - Blockers: None. RED was confirmed by the missing `aiStrategyShortlistFromState` export.
  - User Confirmation Status: Pending Confirmation.
- Step: 4-5. Implement `aiStrategyShortlistFromState` and confirm GREEN.
  - Modifications: Added shortlist ranking helpers and exported `aiStrategyShortlistFromState` in `client/data/ai-goal-preset.mjs`.
  - Change Summary: AI now ranks generated drafts, validation runs, paper candidates, running validations, and observation-only drafts into one queue.
  - Reason: Executing plan steps 4 and 5.
  - Blockers: None. Target Node test passed with 99 tests.
  - User Confirmation Status: Pending Confirmation.
- Step: 6-7. Import helper, define UI types, and render the panel.
  - Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx`.
  - Change Summary: Added `AIStrategyShortlistPanel` above the action queue with metrics, ranked cards, guardrails, next checks, and existing action wiring.
  - Reason: Executing plan steps 6 and 7.
  - Blockers: TypeScript initially rejected the JS helper type bridge; fixed by using the existing `unknown as` pattern for JS helper imports.
  - User Confirmation Status: Pending Confirmation.
- Step: 8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
  - Modifications: No code changes from verification.
  - Change Summary: Target and regression tests passed; smoke confirmed auth redirect and login page response. Browser plugin local navigation was blocked by environment policy while curl succeeded.
  - Reason: Executing plan step 8.
  - Blockers: Existing lint warning remains in `client/data/use-activity-center.tsx:138`.
  - User Confirmation Status: Pending Confirmation.

## Final Review

Implementation matches the final plan. The only deviation was a minor TypeScript bridge correction in `client/app/(dashboard)/ai-money/client.tsx`, using the same `unknown as` cast pattern already present for JS helpers in this file. No backend routes, live toggles, or trading execution paths were changed.
