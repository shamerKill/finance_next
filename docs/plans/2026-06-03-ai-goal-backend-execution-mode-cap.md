# AI Goal Backend Execution Mode Cap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure direct backend AI goal analysis requests also start at observe/paper, matching the frontend cap and preventing testnet/mainnet from becoming the default requested execution mode.

**Architecture:** Add the cap at `normalizeGoalRequest` in `gateway/internal/http/handlers/ai_goal.go`, before prompt construction, context building, persistence, and fallback analysis. This keeps direct API calls, UI submissions, and persisted AI runs aligned: AI can analyze, validate, and describe gated progression, but higher execution stages remain later evidence-gated states.

**Tech Stack:** Go Echo handler helpers, Go test, TDD.

### Task 1: Add Failing Backend Coverage

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Steps:**
1. Add `TestAIGoalNormalizeRequestCapsUnsafeExecutionModes`.
2. Assert `mainnet`, `testnet`, and unknown execution modes normalize to `paper`.
3. Assert `paper` stays `paper`.
4. Assert `observe` stays `observe`.
5. Verify the test fails because `normalizeGoalRequest` currently preserves raw modes.

### Task 2: Cap Backend Request Mode

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Steps:**
1. Add `safeRequestedGoalExecutionMode(mode string) string`.
2. Return `observe` only for explicit observe.
3. Return `paper` for paper, empty, testnet, mainnet, and unknown values.
4. Use the helper when assigning `ExecutionMode` in `normalizeGoalRequest`.
5. Run `gofmt` on the modified Go files.

### Task 3: Verify

**Commands:**
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -run TestAIGoalNormalizeRequestCapsUnsafeExecutionModes -count=1`
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Expected:** Frontend and backend both cap initial AI goal analysis requests to observe/paper while preserving the later gated path toward paper review and testnet readiness.
