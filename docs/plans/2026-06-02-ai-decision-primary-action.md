# Context
Filename: 2026-06-02-ai-decision-primary-action.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Make the AI next-step decision card directly actionable for safe workflow steps, reducing the gap between AI guidance and operator action.

# Project Overview
The `/ai-money` page can generate AI strategy blueprints, validate them, choose paper candidates, track paper watch, and compute the next safe decision. The decision card still required users to find the corresponding action elsewhere.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
`nextAIGoalDecision` already classifies the current workflow stage. It can safely expose a `primaryAction` for non-dangerous operations: run all backtests, adopt a paper candidate, or open a related link. It should not expose any live trading or order-submission action.

# Proposed Solution
Add `primaryAction` to decision output and render a primary button in `/ai-money`. The only executable callbacks are existing safe frontend flows: `onRunAllBacktests` and `onAcceptPaperCandidate`. Link actions remain navigation only.

# Implementation Plan
Implementation Checklist:
1. Add unit coverage for decision primary actions.
2. Add `primaryAction` fields to `nextAIGoalDecision`.
3. Wire decision card buttons to safe callbacks.
4. Run frontend tests, lint, typecheck, and production build.

# Current Execution Step
> Currently executing: "Step 4. Run frontend tests, lint, typecheck, and production build"

# Task Progress
*   2026-06-02
    *   Step: 1-3. Add decision primary actions and UI buttons
    *   Modifications: `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: The AI next-step card now provides safe primary actions for batch validation, paper candidate adoption, and strategy prefill navigation.
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
Implementation matches the plan. The decision card only triggers safe validation/adoption/navigation actions and does not create strategies, enable live trading, submit orders, or recommend direct mainnet execution.
