# AI Run Refresh Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make a rescanned AI run easier to evaluate by showing the user what changed between the old judgment and the newer AI run, especially context depth, strategy blueprint count, and human / sentiment factors.

**Architecture:** Reuse the durable `refresh_context` run action linkage. A pure helper scans completed refresh actions, finds the linked newer run, computes a compact comparison model, and the AI Money page renders it as a read-only panel below the follow-up queue.

**Tech Stack:** Next.js client component, existing AI goal run model, pure JavaScript helper, Node test runner, TypeScript typecheck.

### Task 1: Write The Failing Regression Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Build an old run with a completed `refresh_context` action pointing to a newer run.
2. Assert the comparison helper returns one item with old/new run IDs and the linked href.
3. Assert context and strategy draft deltas are surfaced in highlights.
4. Assert new human / sentiment factors are summarized.
5. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED.

### Task 2: Implement The Pure Comparison Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Add a helper that extracts human / sentiment factors from run analysis.
2. Add a comparison item builder for old run, new run, and refresh action.
3. Compute context delta from news, macro, and on-chain counts.
4. Compute strategy draft delta from persisted draft counts.
5. Return a stable empty state when no completed refresh linkage exists.
6. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.

### Task 3: Render The Comparison In AI Money

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import the comparison helper.
2. Add TypeScript state and item types for the panel.
3. Build comparison state from `runs` with `useMemo`.
4. Render `AIRunRefreshComparisonPanel` below `AIRunFollowupQueuePanel`.
5. Allow opening the linked newer run through the existing `openRun` path.
6. Run `cd client && yarn typecheck`.

### Task 4: Verification

**Commands:**
- `node --test client/data/ai-goal-preset.test.mjs`
- `node --test client/data/auth-redirect.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
- HTTP smoke against local Next dev server for `/ai-money?runId=goal+abc`
