# AI Draft One-Click Backtest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the operator validate an AI-generated strategy draft with one click from `/ai-money`, without creating a live strategy or touching exchange execution.

**Architecture:** Reuse the existing `POST /api/v1/backtests` flow. A pure client helper converts a draft into a conservative 90-day `grid_dca` backtest request; `/ai-money` calls `createBacktest()` and redirects to the resulting backtest detail page.

**Tech Stack:** Next.js client component, existing `createBacktest` API helper, Node built-in test runner for helper behavior.

### Task 1: Pure Backtest Request Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Write a failing test for converting a grid DCA AI draft into a 90-day backtest request.
2. Write a failing test proving watch-only drafts do not produce a direct backtest request.
3. Implement `backtestRequestFromDraft()`.

### Task 2: UI Action

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `createBacktest` and `backtestRequestFromDraft`.
2. Add `runBacktestDraft()` in `AIGoalClient`.
3. Add an `一键回测` button to each runnable draft card.
4. Route to `/backtests/:runId` on success and show existing API error UI on failure.

### Task 3: Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build`
