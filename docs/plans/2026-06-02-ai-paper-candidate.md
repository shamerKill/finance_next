# AI Paper Candidate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote the best validated AI draft into an operator-visible paper candidate, reducing the gap between backtest scoring and the next safe action.

**Architecture:** The frontend derives the candidate from the existing AI analysis and backtest head documents. A candidate exists only when a completed backtest is ranked `优先 paper` and its `strategyId` matches an AI draft. Accepting the candidate updates the persisted AI run `strategy` action with a prefilled `/option` link; it does not create a strategy, enable live mode, or submit orders.

**Tech Stack:** Next.js client component, existing AI goal action patch endpoint, existing AI preset helper module, Node built-in test runner.

### Task 1: Candidate Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Add a failing test for `paperCandidateFromValidation()` selecting the best paper-ready draft.
2. Add a failing test proving poor results return `null`.
3. Implement helper by ranking backtests and matching ranked `strategyId` to AI draft preset `strategyId`.
4. Include `strategyHref` and `backtestHref` in the candidate output.

### Task 2: Candidate UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `paperCandidateFromValidation`.
2. Add `PaperCandidate` type and `acceptPaperCandidate()` callback.
3. Show a recommendation callout in `AI 验证评分` when a candidate exists.
4. Persist `strategy` action as `ready` when the user adopts the candidate.
5. Keep the flow manual and safe: no strategy creation, no live toggle, no order submission.

### Task 3: Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `cd client && yarn lint`
- `cd client && yarn typecheck`
- `cd client && yarn build`
