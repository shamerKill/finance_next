# AI Run Refresh Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let AI Money refresh stale or thin-context AI runs directly from the follow-up queue, so the user can keep market direction and sentiment current with one action.

**Architecture:** The follow-up queue marks stale/thin-context runs with a `refresh_run` primary action. The `/ai-money` client resolves that run, restores its saved goal form state, and sends it through the existing analyze-and-validate pipeline. No trading execution path changes.

**Tech Stack:** Next.js client component, HeroUI buttons, existing AI goal REST API, Node test runner, TypeScript typecheck.

### Task 1: Add The Failing Helper Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Extend the stale/thin-context follow-up queue test.
2. Assert `queue.primaryAction.kind === "refresh_run"`.
3. Assert `queue.primaryAction.runId` is the stale run id.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED with actual `open_run`.

### Task 2: Implement The Queue Action

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. In `aiRunFollowupQueueFromRuns`, inspect the top queue item.
2. If `top.actionKind === "refresh_context"`, return primary action `{kind:"refresh_run", label:"重新扫描此运行", runId, href}`.
3. Keep all other non-empty queue cases as `open_run`.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.

### Task 3: Wire The UI Button

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Add `refresh_run` to the local queue primary action type.
2. Add a `refreshRun` callback that fetches the saved run, restores form state via `formStateFromAIGoalRun`, builds `aiGoalRequestFromFormState`, and calls the existing `analyzeAndValidateGoal`.
3. Pass `refreshRun` into `AIRunFollowupQueuePanel`.
4. Render a primary `refresh_run` button and a per-item `重扫` button for `refresh_context` items.
5. Run `cd client && yarn typecheck`.

### Task 4: Verification

**Commands:**
- `node --test client/data/ai-goal-preset.test.mjs`
- `node --test client/data/auth-redirect.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
- HTTP smoke against local Next dev server for `/ai-money?runId=goal+abc`
