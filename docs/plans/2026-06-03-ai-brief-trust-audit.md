# AI Brief Trust Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money brief explain why the current AI plan is trustworthy or blocked, so the operator can quickly observe evidence quality before following the next action.

**Architecture:** The existing `aiMoneyBriefFromState` already computes a confidence score from context, backtests, sentiment, and capital plan. This change keeps that score but adds a structured `audit` object with ready evidence, warnings, and blockers. The AI Money UI renders the audit inside the existing brief panel; no backend or trading execution behavior changes.

**Tech Stack:** Next.js/React frontend, TypeScript types, Node test runner.

### Task 1: Add Brief Audit Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test that builds a thin AI analysis with data notes, no strategy drafts, no validation runs, and no recent memory. Assert that `aiMoneyBriefFromState` returns an `audit` object containing data and validation blockers plus a warning about missing AI history.

**Step 2: Run test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `brief.audit` does not exist yet.

### Task 2: Implement Audit Logic

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add `aiMoneyBriefAuditFromState` near `workflowConfidence`. It should return:

- `verdict`: short Chinese status label.
- `tone`: `success`, `warning`, or `danger`.
- `ready`: concise evidence already satisfied.
- `warnings`: cautionary items.
- `blockers`: items preventing the next execution step.

**Step 2: Wire into brief**

Call the helper in idle, stale, and active branches of `aiMoneyBriefFromState`. Keep the existing confidence and primary action behavior unchanged.

**Step 3: Run target test**

Run the same Node test and confirm it passes.

### Task 3: Render Audit in the UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend type**

Add `audit` to `AIMoneyBriefState`.

**Step 2: Render audit**

Inside `AIMoneyBriefPanel`, below metrics and before checkpoints, render three compact columns:

- `已满足`
- `风险提醒`
- `阻塞项`

Use existing `PlanList` and avoid new card nesting.

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
1. Add the plan document.
2. Add the failing brief audit test.
3. Run the target Node test and confirm RED.
4. Implement brief audit helper and wire it into all brief states.
5. Run the target Node test and confirm GREEN.
6. Extend `AIMoneyBriefState` and render the audit.
7. Run frontend tests, typecheck, lint, Go tests, and diff checks.
8. Review implementation against this plan.
