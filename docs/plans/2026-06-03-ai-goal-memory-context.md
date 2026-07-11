# AI Goal Memory Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Feed recent AI goal run history back into the next AI analysis so the agent can learn from prior goals, validation actions, paper watches, refreshes, and context gaps.

**Architecture:** Extend the existing backend `aiGoalContext` with a small list of recent `ai_goal_runs`. `buildGoalContext` reads at most five prior runs for the current user, strips full analysis payloads, and records only compact evidence useful for the prompt. `buildGoalPrompt` renders a new "Recent AI goal memory" section before existing strategy overlap.

**Tech Stack:** Go Echo handler, existing Mongo AI run repo interface, Go unit tests, current AI goal prompt builder.

### Task 1: Write The Failing Prompt Test

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Steps:**
1. Create an `aiGoalContext` with two recent AI run summaries.
2. Include one run with a completed `backtest` action and one with a manual `paper_watch` action.
3. Call `buildGoalPrompt(req, ctx)`.
4. Assert the prompt includes `Recent AI goal memory`.
5. Assert the prompt includes goal, summary, context counts, strategy draft count, and action status.
6. Run `cd gateway && go test ./internal/http/handlers -run TestBuildGoalPromptIncludesRecentAIGoalMemory` and confirm RED.

### Task 2: Extend AI Goal Context With Memory

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Steps:**
1. Add `RecentRuns []mongostore.AIGoalRunDoc` to `aiGoalContext`.
2. In `buildGoalContext`, when `h.runs` is configured, read `FindAllForUser(ctx, userID, 5)`.
3. Append a context note when reading run memory fails.
4. Strip `Analysis` from each recent run before placing it in context.
5. Keep the feature read-only; it must not mutate prior runs.

### Task 3: Render Memory In The Prompt

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Steps:**
1. Add a `Recent AI goal memory` section to `buildGoalPrompt`.
2. If there are no runs, render `- none`.
3. For each run, render created time, goal, symbols, AI status, execution mode, strategy draft count, context counts, and compact summary.
4. Render up to five actions per run as `action=<id> status=<status> related=<relatedId> note=<note>`.
5. Keep every line compact and avoid serializing full analysis.
6. Run `cd gateway && go test ./internal/http/handlers -run TestBuildGoalPromptIncludesRecentAIGoalMemory` and confirm GREEN.

### Task 4: Verification

**Commands:**
- `cd gateway && go test ./internal/http/handlers`
- `cd gateway && go test ./...`
- `node --test client/data/ai-goal-preset.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
