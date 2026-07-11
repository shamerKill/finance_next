# AI Command Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-screen AI command center that tells the operator what the AI can do now, what is blocked, what evidence exists, and which safe next action moves the money-making goal forward.

**Architecture:** Build a pure `aiCommandCenterFromState` helper from existing AI Money primitives instead of adding a new backend contract. The helper summarizes scan, validation, sentiment, paper, execution readiness, and run-history state into one UI model. The AI Money page renders that model and maps its primary action to the existing handlers.

**Tech Stack:** Next.js client component, pure JavaScript helper, existing AI goal run action model, Node test runner, TypeScript typecheck, ESLint.

### Task 1: Write The Failing Command Center Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Add an import for `aiCommandCenterFromState`.
2. Add a test for the idle state with no analysis and no daily radar run.
3. Assert the stage is `scan`, the primary action is `analyze_and_validate`, and the summary mentions market / sentiment context.
4. Add a test for a strong validated paper candidate with completed sentiment review and paper watch pending.
5. Assert the stage is `paper_candidate`, the primary action is `accept_paper_candidate`, and the evidence lane includes backtest, human / sentiment, and safety gate items.
6. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED because `aiCommandCenterFromState` is not exported.

### Task 2: Implement The Pure Command Center Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Export `aiCommandCenterFromState(input)`.
2. Reuse `nextAIGoalDecision`, `aiExecutionReadinessFromState`, `aiSentimentCompassFromAnalysis`, and `paperCandidateFromValidation`.
3. Return a stable idle command center when there is no active analysis.
4. Return a paper-candidate command center when validation is strong and paper adoption is safe.
5. Include compact metrics for context count, strategy draft count, validation count, and execution readiness score.
6. Include evidence lane items for market context, strategy drafts, validation, human / sentiment, safety gates, and latest run queue.
7. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm GREEN.

### Task 3: Render The Command Center In AI Money

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Import `aiCommandCenterFromState`.
2. Add TypeScript types for command center state, metric, and evidence lane items.
3. Build `commandCenter` with `useMemo` from `analysis`, active actions, validation runs, runs, accounts, and daily radar status.
4. Render `AICommandCenterPanel` at the top of the main AI Money content column.
5. Map primary actions to existing handlers: scan / analyze, run all backtests, accept paper candidate, sentiment review, and open link.
6. Keep the panel read-only for unsafe execution; it must not add mainnet or testnet submit behavior.
7. Run `cd client && yarn typecheck`.

### Task 4: Verification

**Commands:**
- `node --test client/data/ai-goal-preset.test.mjs`
- `node --test client/data/auth-redirect.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
- HTTP smoke against local Next dev server for `/ai-money?runId=goal+abc`
