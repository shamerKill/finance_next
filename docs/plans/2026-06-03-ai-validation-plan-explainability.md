# AI Validation Plan Explainability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the automatic AI validation plan explain what it will test, what it skips, and which safety assumptions apply before backtests are launched.

**Architecture:** `autoValidationPlanFromAnalysis` already builds runnable backtest requests from AI strategy drafts. This change augments the plan with human-readable `coverage`, `guardrails`, and `skippedDrafts` fields. The UI renders those fields in the AI action queue so the operator can understand the validation scope before pressing the batch backtest button.

**Tech Stack:** Next.js/React frontend, TypeScript types, Node test runner.

### Task 1: Add Validation Plan Explainability Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Extend the existing `autoValidationPlanFromAnalysis prepares a safe AI validation batch` test to assert:

- `coverage` includes runnable symbols and a 90 day / 1h validation window.
- `guardrails` includes paper-first and no-mainnet safety text.
- `skippedDrafts` includes the watch-only draft.

**Step 2: Run test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because the new plan fields do not exist yet.

### Task 2: Implement Plan Fields

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add skipped draft extraction**

Inside `autoValidationPlanFromAnalysis`, compare all strategy drafts with runnable drafts and build `skippedDrafts` rows with `name`, `kind`, `symbol`, and `reason`.

**Step 2: Add coverage and guardrails**

For ready plans, include concise coverage strings for runnable symbols, timeframe/window, and draft names. For all plans, include safety guardrails that clarify validation does not place orders and does not approve mainnet.

**Step 3: Run target test**

Run the Node test and confirm it passes.

### Task 3: Render in AI Money UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend `AutoValidationPlan` type**

Add `coverage`, `guardrails`, and `skippedDrafts`.

**Step 2: Render plan explanation**

In `ActionPlanPanel`, render a compact validation plan section when there are runnable drafts or skipped drafts:

- `验证覆盖`
- `安全边界`
- skipped draft text for skipped drafts

Use existing `PlanList`.

### Task 4: Verification

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
1. Add the validation plan explainability plan document.
2. Add failing assertions for validation coverage, guardrails, and skipped drafts.
3. Run the target Node test and confirm RED.
4. Implement validation explainability fields.
5. Run the target Node test and confirm GREEN.
6. Extend UI type and render validation plan explanation.
7. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
8. Review implementation against this plan.
