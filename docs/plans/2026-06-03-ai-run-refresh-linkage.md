# AI Run Refresh Linkage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent stale AI runs from repeatedly reappearing as refresh work after the user has already rescanned them, while preserving a visible link from the old judgment to the newer AI run.

**Architecture:** Reuse persisted AI goal run actions. When a refresh creates a newer run, the old run receives a `refresh_context` action with `status=done`, `relatedId=<new run id>`, and a deep link to the newer run. The follow-up queue treats that old run as reviewable instead of refreshable.

**Tech Stack:** Next.js client component, existing AI goal run action PATCH API, Node test runner, TypeScript typecheck.

### Task 1: Write The Failing Regression Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Build a stale/thin-context run with a persisted `refresh_context` action marked `done`.
2. Assert the queue stage is `steady`.
3. Assert the queue item action is `review_run` and its href points to the newer run.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED.

### Task 2: Update The Queue Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Read `refresh_context` from persisted actions.
2. If it is `done`, return a low-priority `review_run` item before stale/thin-context refresh logic.
3. Prefer the action href, then `relatedId`, then the current run href.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.

### Task 3: Persist Linkage From The UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Change `analyzeAndValidateGoal` to return the new `TypeAIGoalAnalysis | null`.
2. In `refreshRun`, after the new run is created, PATCH the old run action `refresh_context`.
3. Store `status=done`, `relatedId=<new id>`, `href=/ai-money?runId=<new id>`, and a short note.
4. Update the local `runs` array without stealing focus from the new active run.
5. Run `cd client && yarn typecheck`.

### Task 4: Verification

**Commands:**
- `node --test client/data/ai-goal-preset.test.mjs`
- `node --test client/data/auth-redirect.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
- HTTP smoke against local Next dev server for `/ai-money?runId=goal+abc`
