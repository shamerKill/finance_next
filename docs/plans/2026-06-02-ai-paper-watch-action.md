# Context
Filename: 2026-06-02-ai-paper-watch-action.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Make the AI paper candidate observable as a persistent action in the AI goal workflow, so users can track the paper observation step before any testnet or mainnet execution.

# Project Overview
The project now supports goal-driven AI analysis, draft strategy generation, batch backtesting, validation scoring, and paper candidate recommendation. The action queue still needed a persisted paper observation stage after a candidate is selected.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The action queue is derived from `actionPlanFromAnalysis` and persisted run actions. Existing allowed actions were `review`, `data`, `backtest`, `strategy`, and `gate`. A selected paper candidate only updated the `strategy` action, so the observation period was visible in the score panel but not tracked in the queue.

# Proposed Solution
Add a `paper_watch` action id to the backend whitelist and teach the frontend action plan to append a persisted paper observation item. When the user adopts a paper candidate, persist both the strategy prefill action and the paper observation action.

# Implementation Plan
Implementation Checklist:
1. Add frontend unit coverage for a persisted `paper_watch` action.
2. Add backend handler coverage allowing `paper_watch`.
3. Update `actionPlanFromAnalysis` to append persisted paper observation actions.
4. Update `/ai-money` paper candidate adoption to persist `paper_watch`.
5. Verify frontend and backend tests.

# Current Execution Step
> Currently executing: "Step 5. Verify frontend and backend tests"

# Task Progress
*   2026-06-02
    *   Step: 1-4. Add tests and implement persistent paper watch action
    *   Modifications: `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, `gateway/internal/http/handlers/ai_goal_test.go`, `gateway/internal/http/handlers/ai_goal.go`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: AI paper candidates now create a persisted `paper_watch` action that appears in the operator queue with a link back to the related backtest.
    *   Reason: Executing plan steps 1-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Verify frontend and backend tests
    *   Modifications: Verified frontend helper tests, frontend lint/typecheck/build, and backend AI goal handler tests.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `yarn lint`, `yarn typecheck`, `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-cache go test ./internal/http/handlers -run 'TestAIGoal'`, and non-sandbox `yarn build` passed.
    *   Reason: Executing plan step 5
    *   Blockers: Sandbox `yarn build` cannot fetch Google Fonts; non-sandbox build passed.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. The new `paper_watch` action only tracks paper observation and does not create strategies, enable live trading, or submit orders.
