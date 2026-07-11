# AI Operator Constraints Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make operator behavior, narrative, and avoid constraints visible in AI goal results and restorable from saved runs.

**Architecture:** Add an `operatorConstraints` summary to the backend AI analysis context. Reuse that context in the frontend helper to restore form text and render a compact constraints panel in the AI Money analysis result.

**Tech Stack:** Go Echo handler tests, Next.js React client, TypeScript declarations, Node ESM helper tests.

### Task 1: Backend Context Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Write failing test**

Add a test proving `parseGoalAIResponse()` returns `Context.OperatorConstraints` containing:
- behavior constraints
- market narrative focus
- avoid scenarios

**Step 2: Run RED**

Run: `go test ./internal/http/handlers -run TestParseGoalAIResponseCarriesOperatorConstraints`

Expected: FAIL because `aiGoalContextSummary` has no operator constraints field.

### Task 2: Frontend Restore Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing test**

Extend `formStateFromAIGoalRun` coverage so a saved run with `analysis.context.operatorConstraints` restores:
- `behaviorText`
- `narrativeText`
- `avoidText`

**Step 2: Run RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the helper does not read `operatorConstraints`.

### Task 3: Implement Backend Summary

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`
- Modify: `client/data/type.d.ts`

**Step 1: Add structs and summary fields**

Add `aiGoalOperatorConstraints` and `OperatorConstraints` to `aiGoalContextSummary`. Populate it in `summarizeGoalContext(req, goalCtx)`.

**Step 2: Add TypeScript context type**

Add `operatorConstraints?: { behaviorConstraints: string[]; marketNarrativeFocus: string[]; avoidScenarios: string[] }`.

### Task 4: Implement Frontend Restore and Display

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Restore form text**

Make `formStateFromAIGoalRun` read `run.analysis.context.operatorConstraints` and join each list with newline characters.

**Step 2: Render analysis panel**

In `AnalysisResult`, render a compact section titled `AI 已纳入的个人约束` when any list has values.

### Task 5: Verify

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `go test ./internal/http/handlers -run TestParseGoalAIResponseCarriesOperatorConstraints`
- `yarn typecheck`
- `go test ./...`
- `git diff --check`

Smoke `/ai-money` in the browser if the dev server starts.
