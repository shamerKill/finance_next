# AI Risk Cap Leverage Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure AI-generated strategy drafts cannot prefill or persist strategy parameters that exceed their own risk caps.

**Architecture:** The gateway normalizes AI provider output after parsing, so every draft has safe `riskCaps` and capped trading params before it is returned to the UI. The client applies the same cap again when converting a draft into `/option` search params, so stale or manually altered payloads still prefill conservatively.

**Tech Stack:** Go Echo gateway, Node test runner, Next.js client helper modules.

### Task 1: Frontend Draft Prefill Cap

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Add a test proving `strategyPresetSearchFromDraft()` caps `positionLevel` by `riskCaps.maxLeverage` when AI params request higher leverage.

**Step 2: Run the frontend test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: the new test fails with `positionLevel` equal to the uncapped value.

**Step 3: Write minimal implementation**

Update `strategyPresetFromDraft()` to compute a bounded leverage maximum from normalized risk caps and pass that maximum into `clampInt(params.positionLevel, ...)`.

**Step 4: Run the frontend test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: all tests pass.

### Task 2: Backend AI Draft Param Normalization

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Write the failing test**

Add a parser test proving unsafe AI output with `riskCaps.maxLeverage=3`, `params.positionLevel=50`, and `params.orderGroupMargin=999` is normalized before returning the analysis.

**Step 2: Run the backend test to verify it fails**

Run: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestParseGoalAIResponseCapsDraftParamsByRiskCaps -count=1`

Expected: the test fails because params are not capped yet.

**Step 3: Write minimal implementation**

Add numeric helpers in `ai_goal.go`, then call a `normalizeGoalDraftParams()` helper from `normalizeGoalStrategyDrafts()` after risk caps are filled.

**Step 4: Run focused backend tests**

Run: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1`

Expected: handler package tests pass.

### Task 3: Verification

**Files:**
- Update: `docs/plans/2026-06-02-ai-risk-cap-leverage-alignment.md`

**Step 1: Format Go files**

Run: `gofmt -w gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go`

**Step 2: Run regression checks**

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1`
- `yarn typecheck` from `client/`
- `git diff --check`

**Step 3: Record outcome**

Append the verification results to this plan. Do not stage or commit unless the user asks.

### Task 4: Manual URL Param Guard

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Add a test proving `parseStrategyPreset()` caps manually edited `/option` query values by `riskMaxLeverage` and `riskMaxPositionUsd`.

**Step 2: Run the frontend test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: the new test fails because parsed `positionLevel` remains `50`.

**Step 3: Write minimal implementation**

Compute risk-derived max leverage and max order group margin before building the parsed preset, then pass those bounds into the existing clamp calls.

**Step 4: Run the frontend test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: all tests pass.

## Verification Results

- RED frontend: `node --test client/data/ai-goal-preset.test.mjs` failed as expected because `positionLevel` remained `50` instead of `3`.
- RED backend: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestParseGoalAIResponseCapsDraftParamsByRiskCaps -count=1` failed as expected because parsed `positionLevel` remained `50`.
- RED manual URL guard: `node --test client/data/ai-goal-preset.test.mjs` failed as expected because `parseStrategyPreset()` kept manually edited `positionLevel=50`.
- GREEN frontend: `node --test client/data/ai-goal-preset.test.mjs` passed, 56/56 tests.
- GREEN backend focused: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestParseGoalAIResponseCapsDraftParamsByRiskCaps -count=1` passed.
- Handler package: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -count=1` passed.
- Client typecheck: `yarn typecheck` passed.
- Diff whitespace: `git diff --check` passed.
- Gateway full suite: sandboxed `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...` failed because `httptest` cannot bind local ports in the sandbox; rerun outside sandbox with `go test ./...` passed.
