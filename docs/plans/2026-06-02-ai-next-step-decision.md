# Context
Filename: 2026-06-02-ai-next-step-decision.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Add an AI next-step decision layer to the goal workflow so the operator can immediately see whether to backtest, wait, adopt a paper candidate, continue paper observation, pause, or move only as far as a testnet candidate.

# Project Overview
The `/ai-money` workflow already generates AI strategy drafts, creates backtests, ranks validation results, selects paper candidates, and persists paper observation actions. The remaining usability gap is that users still have to infer the next safe action from multiple panels.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The state needed for a next-step decision already exists client-side: AI analysis context, persisted actions, and fetched backtest runs. A pure helper can classify the current phase without adding any automatic execution path.

# Proposed Solution
Add `nextAIGoalDecision(analysis, persistedActions, backtests)` and render it as an "AI 下一步判断" card near the top of `/ai-money`. The helper must never suggest direct mainnet execution; even after strong validation and completed paper observation, it only promotes to a testnet candidate.

# Implementation Plan
Implementation Checklist:
1. Add unit coverage for decision states: backtest needed, paper observation, testnet candidate, and redesign.
2. Implement `nextAIGoalDecision`.
3. Render the decision card in `/ai-money`.
4. Run frontend tests, lint, typecheck, and production build.

# Current Execution Step
> Currently executing: "Step 4. Run frontend tests, lint, typecheck, and production build"

# Task Progress
*   2026-06-02
    *   Step: 1-3. Add decision tests, helper, and UI card
    *   Modifications: `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: `/ai-money` now surfaces an AI next-step decision based on data gaps, validation state, paper candidate quality, and paper observation status.
    *   Reason: Executing plan steps 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Run frontend tests, lint, typecheck, and production build
    *   Modifications: Verified helper tests and frontend build pipeline.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `yarn lint`, `yarn typecheck`, and non-sandbox `yarn build` passed.
    *   Reason: Executing plan step 4
    *   Blockers: Sandbox `yarn build` cannot fetch Google Fonts; non-sandbox build passed.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. The decision layer is read-only guidance and never creates strategies, enables live trading, submits orders, or recommends direct mainnet execution.
