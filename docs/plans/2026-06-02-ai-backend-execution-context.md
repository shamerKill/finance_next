# AI Backend Execution Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI goal agent consider real execution constraints such as account readiness, kill switch state, and portfolio limits when generating strategy drafts.

**Architecture:** Extend `aiGoalContext` with an execution context summary collected from account and system repositories. The prompt renders this summary, and `analysis.context` returns the same safe non-secret fields to the client.

**Tech Stack:** Go Echo gateway, Mongo-backed repositories, Go unit tests.

### Task 1: Failing Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Add prompt test**

Extend `TestAIGoalPromptIncludesMarketAndHumanContext` or add a new test proving `buildGoalPrompt()` includes:
- tradeable account count;
- trading halt state/reason;
- portfolio limit values.

**Step 2: Add context collection test**

Add a test with fake account/system stores proving `buildGoalContext()` fills execution context and notes no secrets.

**Step 3: Run tests to verify failure**

Run: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestAIGoal.*ExecutionContext' -count=1`

Expected: tests fail because execution context fields do not exist.

### Task 2: Context Types and Collection

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Add interfaces**

Add small interfaces for account and system context dependencies:
- account store with `FindAll(ctx,userID)`;
- system store with `GetSystemState(ctx)` and `GetPortfolioLimits(ctx,userID)`.

**Step 2: Extend context structs**

Add `aiGoalExecutionContext` and embed it in `aiGoalContext` and `aiGoalContextSummary`.

**Step 3: Collect context**

In `buildGoalContext()`, query accounts and system repo, derive counts only, append safe notes on errors, and avoid returning credentials or encrypted fields.

### Task 3: Prompt and Wiring

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`
- Modify: `gateway/internal/http/router.go`

**Step 1: Render prompt section**

Add an "Execution readiness" section to `buildGoalPrompt()` with account readiness, halt state, and portfolio limits.

**Step 2: Include summary**

Update `summarizeGoalContext()` to include the execution context summary.

**Step 3: Wire account repo**

Update router AI goal handler construction to pass or attach `d.AccountRepo`.

### Task 4: Verification

**Files:**
- Update: `docs/plans/2026-06-02-ai-backend-execution-context.md`

**Step 1: Run checks**

Run:
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1`
- `go test ./...` from `gateway/` outside sandbox if full suite needs `httptest` ports
- `git diff --check`

**Step 2: Record outcome**

Append verification results. Do not stage or commit unless requested.

## Verification Results

- RED tests: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestAIGoal.*ExecutionContext' -count=1` failed as expected because `aiGoalContext.Execution`, `aiGoalExecutionContext`, and account/system abstractions did not exist.
- GREEN focused tests: the same command passed after adding execution context collection and prompt rendering.
- Handler package: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1` passed.
- Router package: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http -count=1` passed.
- Gateway full suite: sandboxed `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...` failed because `httptest` cannot bind local ports in the sandbox; rerun outside sandbox with `go test ./...` passed.
- Client type sync: `yarn typecheck` passed after adding `TypeAIGoalExecutionContext` to `client/data/type.d.ts`.
- Client helper regression: `node --test client/data/ai-goal-preset.test.mjs` passed, 58/58 tests.
- Diff whitespace: `git diff --check` passed.
