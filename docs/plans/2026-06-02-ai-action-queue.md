# AI Action Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert a goal-agent analysis into a visible action queue so the operator can move from AI reasoning to safe validation and setup steps without guessing the next click.

**Architecture:** Derive task status from the existing analysis response on the client. The queue does not execute trades; it links to data review, starts a backtest, opens the prefilled strategy form, and points to trading gate settings.

**Tech Stack:** Next.js client component, existing AI goal helper module, Node built-in test runner.

### Task 1: Pure Action Derivation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Write a failing test that expects an analysis with data gaps and runnable drafts to produce review/data/backtest/strategy/gate tasks.
2. Write a failing test that expects watch-only analysis to block backtest/strategy actions.
3. Implement `actionPlanFromAnalysis()`.

### Task 2: UI Queue

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `actionPlanFromAnalysis`.
2. Add `ActionQueue` under the analysis overview.
3. Map statuses to existing `StatusBadge` tones.
4. Wire queue actions to existing safe surfaces: data explorer, one-click backtest, strategy preset, and trading settings.

### Task 3: Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build`

### Task 4: Persisted Action State

**Files:**
- Modify: `gateway/internal/store/mongo/ai_goal_repo.go`
- Modify: `gateway/internal/http/handlers/ai_goal.go`
- Modify: `client/data/type.d.ts`
- Modify: `client/data/api-client.ts`
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Add a failing pure helper test proving persisted `actions` can override a derived action status and link.
2. Add failing Go tests for repository input guards and action patch status normalization.
3. Store `actions` on `ai_goal_runs`, with each action carrying `id`, `status`, optional `relatedId`, optional relative `href`, optional `note`, and `updatedAt`.
4. Add `PATCH /api/v1/ai/goals/runs/:id/actions/:actionId` to upsert safe action state for the current user.
5. Keep action ids fixed to `review`, `data`, `backtest`, `strategy`, and `gate`; keep statuses fixed to `done`, `ready`, `manual`, and `blocked`.
6. After one-click AI draft backtest succeeds, mark the `backtest` action as `done` and persist the returned backtest run link.

**Verification completed on 2026-06-02:**
- `node --test client/data/ai-goal-preset.test.mjs`
- `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-build go test ./internal/store/mongo -run 'TestAIGoal'`
- `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-build go test ./internal/http/handlers -run 'TestAIGoal'`
- `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-build go test ./...` (requires local port permission for `httptest`)
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build` (requires Google Fonts network access)
