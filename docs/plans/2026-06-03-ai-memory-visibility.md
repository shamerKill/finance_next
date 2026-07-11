# AI Memory Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make recent AI goal runs visible in the AI Money command center so the operator can see when the AI reused prior analysis, conclusions, and follow-up state.

**Architecture:** The gateway already loads recent AI goal runs into prompt context. This change adds a compact, safe context summary to the analyze response and teaches the frontend command center to render that memory as an evidence item. The summary deliberately omits the stored full analysis payload to avoid leaking stale or oversized data.

**Tech Stack:** Go Echo gateway, Mongo-backed AI goal run documents, Next.js/TypeScript frontend, Node test runner.

### Task 1: Backend Context Summary

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Write the failing test**

Add `TestSummarizeGoalContextIncludesRecentRunMemory` in `gateway/internal/http/handlers/ai_goal_test.go`. The test builds an `aiGoalContext` with two `mongostore.AIGoalRunDoc` records and asserts that `summarizeGoalContext` exposes only compact fields: count, id, goal, summary, status, execution mode, strategy draft count, context counts, and action count.

**Step 2: Run test to verify it fails**

Run:

```bash
cd gateway
GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestSummarizeGoalContextIncludesRecentRunMemory
```

Expected: FAIL because the summary fields do not exist yet.

**Step 3: Write minimal implementation**

Add a small `aiGoalRecentRunSummary` response struct and fields on `aiGoalContextSummary`. Implement a helper that maps `goalCtx.RecentRuns` into safe summaries and call it from `summarizeGoalContext`.

**Step 4: Run test to verify it passes**

Run the same targeted Go test, then the handler package tests.

### Task 2: Frontend Command Center Evidence

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/data/type.d.ts`

**Step 1: Write the failing test**

Extend the safe paper candidate command center test with `context.recentRunCount` and `context.recentRunSummaries`. Assert that the command center evidence contains an `ai_memory` item with `done` status and references the prior goal.

**Step 2: Run test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because the command center does not produce `ai_memory` evidence yet.

**Step 3: Write minimal implementation**

Add optional recent memory fields to `TypeAIGoalAnalysis.context`. In `aiCommandCenterFromState`, derive memory count and a short label from `context.recentRunSummaries`, then insert an `ai_memory` evidence item between market context and strategy drafts.

**Step 4: Run test to verify it passes**

Run the same Node test and TypeScript typecheck.

### Task 3: Verification

Run:

```bash
cd gateway
GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers
GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...
node --test client/data/ai-goal-preset.test.mjs
node --test client/data/auth-redirect.test.mjs
cd client
yarn typecheck
yarn lint
git diff --check
```

Expected: all tests pass. Existing lint warning in `client/data/use-activity-center.tsx` may remain unchanged.

Implementation Checklist:
1. Add the plan document for AI memory visibility.
2. Add the failing backend context summary test.
3. Run the targeted backend test and confirm RED.
4. Implement backend recent run summary fields.
5. Run targeted and package Go tests and confirm GREEN.
6. Add the failing frontend command center memory evidence test.
7. Run the frontend test and confirm RED.
8. Implement frontend type and command center evidence changes.
9. Run frontend tests, typecheck, lint, Go suite, and diff checks.
10. Review implementation against this plan.
