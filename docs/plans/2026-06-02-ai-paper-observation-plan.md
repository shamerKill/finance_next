# Context
Filename: 2026-06-02-ai-paper-observation-plan.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Extend the AI goal workflow so that a backtest-approved paper candidate produces an explicit observation plan before any testnet or mainnet execution.

# Project Overview
`finance_next` now supports AI goal analysis, strategy draft generation, batch backtests, validation scoring, and paper candidate selection. The next safe step is to make AI help the operator watch the candidate with market, sentiment, and human-behavior triggers instead of jumping directly to live trading.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The `/ai-money` page already ranks completed backtests and can mark one draft as a paper candidate. The remaining gap is the post-candidate phase: users need a concrete observation window, stop rules, and links for manual review.

# Proposed Solution
Add a deterministic helper that converts the selected paper candidate plus the original AI context into a paper observation plan. The plan should include watch signals, human-factor triggers, safety gates, and safe links. It must remain read-only and must not create a strategy, enable live trading, or submit orders.

# Implementation Plan
Add tests for the helper, implement the helper in `client/data/ai-goal-preset.mjs`, render the plan in `client/app/(dashboard)/ai-money/client.tsx`, and verify with unit tests plus frontend checks.

Implementation Checklist:
1. Add unit tests for the paper observation plan helper.
2. Implement `paperObservationPlanFromCandidate`.
3. Render the plan below the paper candidate recommendation.
4. Run targeted tests and frontend verification.

# Current Execution Step
> Currently executing: "Step 4. Run targeted tests and frontend verification"

# Task Progress
*   2026-06-02
    *   Step: 1-3. Add tests, implement helper, and render paper observation plan
    *   Modifications: `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: Paper candidates now produce an observation window, checklist, stop rules, market/sentiment/human triggers, and safe manual links.
    *   Reason: Executing plan steps 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Run targeted tests and frontend verification
    *   Modifications: Verified the helper tests, lint, typecheck, production build, and local browser login redirect.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `yarn lint`, `yarn typecheck`, and non-sandbox `yarn build` passed. Browser reached `/login?next=%2Fai-money`, confirming the route is protected by auth.
    *   Reason: Executing plan step 4
    *   Blockers: Direct in-browser inspection of `/ai-money` requires an authenticated session.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. No automatic strategy creation, live enablement, or order submission was added.
