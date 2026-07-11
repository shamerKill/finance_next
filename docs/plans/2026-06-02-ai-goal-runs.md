# AI Goal Runs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist every goal-driven AI analysis as an operator-visible run so the user can review past objectives, reopen AI output, and continue the next action instead of losing one-off responses.

**Architecture:** Add a Mongo `ai_goal_runs` collection with user-scoped run documents. The existing `/ai/goals/analyze` endpoint keeps returning the analysis, but also stores the run when the repository is configured. Add list/detail endpoints and a left-side history panel on `/ai-money`.

**Tech Stack:** Go Echo handlers, MongoDB driver v2, Next.js App Router client components, HeroUI.

### Task 1: Backend Run Repository

**Files:**
- Create: `gateway/internal/store/mongo/ai_goal_repo.go`
- Create: `gateway/internal/store/mongo/ai_goal_repo_test.go`

**Steps:**
1. Write failing guard tests for empty `userID`, empty `id`, and invalid `limit`.
2. Implement `AIGoalRunRepo` with `EnsureIndexes`, `Create`, `FindAllForUser`, and `FindByIDForUser`.
3. Decode `_id` as either string or ObjectID so future migrations remain tolerant.

### Task 2: Handler Persistence And Read API

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`
- Modify: `gateway/internal/http/router.go`
- Modify: `gateway/cmd/gateway/main.go`

**Steps:**
1. Write failing handler tests for nil run repo degradation and preview creation.
2. Add a run-store dependency to `AIGoalHandler`.
3. Persist successful and fallback analyses after `runGoalAI`.
4. Add `GET /api/v1/ai/goals/runs` and `GET /api/v1/ai/goals/runs/:id`.
5. Wire the repo through `Deps` and `main`.

### Task 3: Frontend History Panel

**Files:**
- Modify: `client/data/type.d.ts`
- Modify: `client/data/api-client.ts`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Add typed API helpers for run list/detail.
2. Load recent runs on page open.
3. Insert the newly generated analysis into history after submit.
4. Let the user reopen a previous run and inspect the same strategy/action output.

### Task 4: Verification

Run:
- `go test ./internal/store/mongo -run 'TestAIGoal'`
- `go test ./internal/http/handlers -run 'TestAIGoal'`
- `go test ./internal/http/handlers`
- `go test ./...`
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build`
