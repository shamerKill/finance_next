# AI Backtest Scoreboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert AI-triggered backtest runs into an operator-facing validation ranking, so the user can quickly see which AI draft deserves paper-mode observation.

**Architecture:** Keep scoring on the frontend for the first version. The AI money page reads persisted backtest action metadata from `ai_goal_runs.actions`, parses related run IDs, fetches existing backtest head documents, and ranks completed runs with a transparent deterministic score. Non-terminal and failed runs remain visible but cannot be mistaken for paper-ready candidates.

**Tech Stack:** Next.js client component, existing `getBacktest()` API wrapper, existing `TypeBacktest` metrics, Node built-in test runner.

### Task 1: Pure Scoring Helpers

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Add a failing test for `backtestRunIdsFromAction()`.
2. Add a failing test for `rankBacktestValidation()`.
3. Implement run ID parsing from `relatedId` and `/backtests/:id` href.
4. Implement scoring with total return, Sharpe, max drawdown, and trade count.
5. Preserve non-terminal states as `验证中` with no score.

### Task 2: Scoreboard UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `getBacktest`, `backtestRunIdsFromAction`, and `rankBacktestValidation`.
2. Track validation backtest rows, loading state, and errors.
3. Load rows when the active AI run has a persisted `backtest` action.
4. Render `AI 验证评分` with recommendation, score, return, drawdown, Sharpe, trade count, and detail links.

### Task 3: Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build`
