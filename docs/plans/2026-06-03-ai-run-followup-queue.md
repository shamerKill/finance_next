# AI Run Followup Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money easier to operate by surfacing which saved AI goal run needs attention next, instead of forcing the user to manually inspect every historical run.

**Architecture:** A pure frontend helper derives a prioritized queue from existing `TypeAIGoalRun` records and their persisted actions. The `/ai-money` client renders that queue near the daily radar so the user can restore the highest-priority run, open related evidence, or refresh stale market context without adding backend contracts.

**Tech Stack:** Next.js App Router client component, HeroUI controls, Node test runner, existing AI goal run REST data.

### Task 1: Capture Queue Behavior With Failing Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Import the planned `aiRunFollowupQueueFromRuns` helper.
2. Add a test showing manual `paper_watch` actions outrank older routine runs.
3. Add a test showing stale or thin-context runs are flagged for refresh.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED because the helper is missing.

### Task 2: Implement The Pure Queue Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Derive run age from `createdAt`.
2. Detect thin context from `contextNewsCount + contextMacroCount + contextOnchainCount === 0` or `aiStatus=fallback`.
3. Map active actions to priority: `paper_watch` first, then `backtest`, then `strategy`, then stale/thin-context refresh, then draft validation, then routine review.
4. Return a state object with `stage`, `tone`, `summary`, `items`, `nextActions`, and `primaryAction`.
5. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.

### Task 3: Render The Queue In AI Money

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `aiRunFollowupQueueFromRuns`.
2. Add local TypeScript types for queue state and items.
3. Build `runFollowupQueue` from `runs`.
4. Add `AIRunFollowupQueuePanel` below `DailyRadarStatusCard`.
5. Let the panel restore the top run, open related links, or start a scan when there are no runs.
6. Run `cd client && yarn typecheck`.

### Task 4: Verification

**Commands:**
- `node --test client/data/ai-goal-preset.test.mjs`
- `node --test client/data/auth-redirect.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
- HTTP smoke against local Next dev server for `/ai-money?runId=goal+abc`
