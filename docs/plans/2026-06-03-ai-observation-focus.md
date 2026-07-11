# AI Observation Focus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact AI observation focus layer that tells the user what to watch now across market direction, sentiment/human bias, validation evidence, and execution safety.

**Architecture:** Reuse existing analysis helpers and persisted action state. Add a pure `aiObservationFocusFromState()` helper in `client/data/ai-goal-preset.mjs`, cover it with node tests, then render a small panel near the top of `/ai-money`.

**Tech Stack:** Plain JavaScript helper, Next.js client component, Node test runner, TypeScript type annotations in the client component.

### Task 1: Data Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing idle test**

Add a test asserting that `aiObservationFocusFromState({ analysis: null })` returns:
- `stage: "idle"`
- a primary action `{ kind: "scan_today", label: "运行 AI 扫描" }`
- focus items for market, sentiment, validation, and execution
- summary text that mentions market direction, sentiment, and human bias

**Step 2: Write the failing active-analysis test**

Add a test with analysis containing context counts, human factors, watch signals, runnable drafts, and no validation runs. Assert:
- stage is `watching`
- focus contains a market item with news/macro/onchain counts
- focus contains a sentiment item mentioning FOMO or crowded narrative
- focus contains validation status that asks for backtests
- focus contains execution status that still blocks direct trading

**Step 3: Run test to verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiObservationFocusFromState` is not exported yet.

**Step 4: Implement helper**

Add `aiObservationFocusFromState({ analysis, persistedActions, validationRuns, runs, dailyRadarStatus })`.

Return shape:
- `stage`
- `tone`
- `title`
- `summary`
- `primaryAction`
- `primaryHref`
- `items: [{ id, label, tone, status, detail, href? }]`
- `nextActions`

Use existing helpers where useful: `safeStringList`, `rankBacktestValidation`, `autoValidationPlanFromAnalysis`, `aiSentimentCompassFromAnalysis`, `aiExecutionReadinessFromState`, and `dailyRadarStatusFromRuns` caller input.

**Step 5: Run helper tests**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: UI Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Add `aiObservationFocusFromState` to the imports from `@/data/ai-goal-preset.mjs`.

**Step 2: Add local type**

Add `AIObservationFocusState` and item types matching the helper return shape.

**Step 3: Build state**

Create `observationFocus` with `useMemo` using analysis, persisted actions, validation runs, runs, and daily radar status.

**Step 4: Render panel**

Add `AIObservationFocusPanel` immediately after `AIAutonomousCommandPanel`. The panel should show:
- title, summary, status badge, and primary action
- four compact focus rows
- next actions

Button behavior:
- `scan_today` / `rescan_today`: call `onDailyRadarScan()`
- `run_all_backtests`: call `runAllBacktests(analysis)` when analysis exists
- `open_link`: render a link to `primaryHref`

**Step 5: Verify**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

## Task Progress

* 2026-06-03 09:43:08 CST
  * Step: Task 1 and Task 2 complete
  * Modifications:
    * `client/data/ai-goal-preset.test.mjs`: added RED tests for idle and active AI observation focus.
    * `client/data/ai-goal-preset.mjs`: added `aiObservationFocusFromState()` and four observation lanes: market, sentiment/human bias, validation, execution boundary.
    * `client/app/(dashboard)/ai-money/client.tsx`: imported the helper, added local state types, built `observationFocus`, and rendered `AIObservationFocusPanel` below the autonomous command card.
  * Change Summary: AI Money now has a compact observation focus panel that surfaces what AI thinks the user should watch across market direction, sentiment/human behavior, validation, and execution safety.
  * Reason: Continue improving the project toward easier AI-assisted money workflow and clearer observation.
  * Blockers: None. `yarn lint` still reports the pre-existing unrelated unused eslint-disable warning in `client/data/use-activity-center.tsx:138`.
  * User Confirmation Status: Pending Confirmation

## Final Review

Implementation matches the plan. RED first failed because `aiObservationFocusFromState` was not exported. After implementation, the helper tests, combined AI Money workflow tests, TypeScript check, lint, and diff whitespace check completed successfully. No unreported deviations were found.
