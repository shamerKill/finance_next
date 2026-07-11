# AI Batch Backtest Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI money page validate every runnable AI strategy draft as a batch, so the operator can move from goal analysis to multiple backtest candidates with one action.

**Architecture:** Keep execution client-driven and safe. The page derives all runnable backtest requests from the AI analysis, skips watch-only drafts, dedupes duplicate strategy-symbol pairs, creates backtests sequentially through the existing `/api/v1/backtests` endpoint, and persists the AI run `backtest` action with the batch result link. No strategy is created and no live order is submitted.

**Tech Stack:** Next.js client component, existing backtest API wrapper, existing AI goal run action patch endpoint, Node built-in test runner.

### Task 1: Runnable Draft Extraction

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Add a failing test for `runnableBacktestRequestsFromAnalysis()`.
2. Verify the test fails because the helper is missing.
3. Implement the helper to return `{draft, request}` pairs for non-watch drafts.
4. Deduplicate by `strategyId:symbol`.
5. Re-run the helper tests.

### Task 2: Batch Backtest UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `runnableBacktestRequestsFromAnalysis`.
2. Add `batchBacktestBusy` state.
3. Add `runAllBacktests()` to create backtests sequentially.
4. Persist the AI run `backtest` action as `done`, with `relatedId`, `href`, and a Chinese note.
5. Add a `验证全部` button in the AI action queue header.

### Task 3: Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build`
