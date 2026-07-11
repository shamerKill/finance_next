# AI Execution Gate Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure AI goal analysis output cannot ignore real execution blockers such as no safe account, global trading halt, or missing portfolio caps.

**Architecture:** Keep AI provider output as a suggestion, then normalize the parsed analysis using `goalCtx.Execution`. The gateway appends mandatory safety gates, next steps, and draft blockers before returning or persisting the analysis.

**Tech Stack:** Go gateway handler, Go unit tests.

### Task 1: Failing Test

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Write the failing test**

Add a parser test where provider JSON omits all execution blockers while `goalCtx.Execution` has no tradeable account, an active trading halt, and zero portfolio limits.

**Step 2: Run test to verify it fails**

Run: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestParseGoalAIResponseAddsExecutionContextBlockers -count=1`

Expected: FAIL because the safety gates and draft blockers do not include the execution context blockers.

### Task 2: Minimal Implementation

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Add append helper**

Add a small helper that appends trimmed unique strings to a slice.

**Step 2: Add gate normalization**

Add `applyGoalExecutionContextGates(out *aiGoalAnalysis, goalCtx aiGoalContext)` and call it from `fillGoalAnalysisDefaults()` after draft normalization.

**Step 3: Run focused test**

Run the focused test again and verify it passes.

### Task 3: Verification

**Files:**
- Update: `docs/plans/2026-06-02-ai-execution-gate-normalization.md`

**Step 1: Run checks**

Run:
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1`
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http -count=1`
- `go test ./...` from `gateway/` outside sandbox if the sandbox blocks `httptest` ports
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck` from `client/`
- `git diff --check`

**Step 2: Record outcome**

Append verification results. Do not stage or commit unless requested.

## Verification Results

- RED focused test: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestParseGoalAIResponseAddsExecutionContextBlockers -count=1` failed as expected because only generic safety gates were returned.
- GREEN focused test: the same command passed after `applyGoalExecutionContextGates()` appended execution-context gates, next steps, and draft blockers.
- Handler package: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1` passed.
- Router package: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http -count=1` passed.
- Gateway full suite: sandboxed `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...` failed because `httptest` cannot bind local ports in the sandbox; rerun outside sandbox with `go test ./...` passed.
- Client helper regression: `node --test client/data/ai-goal-preset.test.mjs` passed, 58/58 tests.
- Client typecheck: `yarn typecheck` passed.
- Diff whitespace: `git diff --check` passed.
