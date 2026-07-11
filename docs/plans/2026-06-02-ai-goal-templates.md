# Context
Filename: 2026-06-02-ai-goal-templates.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Make it easier to start using the AI goal workflow by adding safe reusable goal templates.

# Project Overview
The `/ai-money` page supports goal-driven AI analysis, strategy drafts, validation, paper candidates, action queues, next-step decisions, and historical run restore. Users still need to write a complete goal prompt from scratch.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The goal form has all fields required to start an AI analysis. Safe templates can fill goal, symbols, horizon, risk preference, and execution mode. Templates must not default to mainnet.

# Proposed Solution
Add `AI_GOAL_TEMPLATES` and `formStateFromGoalTemplate`, then render template buttons at the top of the goal form. Templates only use `observe` or `paper` execution modes.

# Implementation Plan
Implementation Checklist:
1. Add template safety and form-fill unit tests.
2. Implement templates and form helper.
3. Render template buttons in `/ai-money`.
4. Run frontend tests, lint, typecheck, and production build.

# Current Execution Step
> Currently executing: "Step 4. Run frontend tests, lint, typecheck, and production build"

# Task Progress
*   2026-06-02
    *   Step: 1-3. Add templates and wire them into the goal form
    *   Modifications: `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: The AI goal form now has safe presets for low-drawdown crypto, sentiment trend tracking, and prediction-event observation.
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
Implementation matches the plan. Goal templates only prefill safe observe/paper inputs and do not trigger analysis, strategy creation, live trading, or order submission.

---

# Follow-up: Template Direct Analyze

# Analysis
The templates reduced prompt-writing work but still required a second click on the main submit button. The existing submit flow already calls the safe AI goal analysis endpoint and does not create strategies, enable live mode, or submit orders.

# Proposed Solution
Keep the existing template fill behavior, and add a separate compact "分析" action for each template. Both normal submit and template direct analyze should use one shared request builder so symbol cleanup and execution-mode handling stay consistent.

# Implementation Plan
Implementation Checklist:
1. Add a failing helper test for generating a clean AI goal request from template form state.
2. Implement the request helper in `client/data/ai-goal-preset.mjs`.
3. Refactor `/ai-money` submit handling to reuse the helper and shared analysis runner.
4. Render each template with both fill and direct analysis actions.
5. Run frontend helper tests, lint, typecheck, and production build.

# Current Execution Step
> Completed: "Step 5. Run frontend helper tests, lint, typecheck, and production build"

# Task Progress
*   2026-06-02
    *   Step: 1. Add a failing helper test
    *   Modifications: `client/data/ai-goal-preset.test.mjs`
    *   Change Summary: Added coverage for a template-derived AI goal analysis request, including symbol cleanup, dedupe, eight-symbol cap, and safe paper mode.
    *   Reason: Executing follow-up plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2-4. Implement direct template analysis
    *   Modifications: `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: Added `aiGoalRequestFromFormState`, refactored analysis submission, and rendered a per-template "分析" button.
    *   Reason: Executing follow-up plan steps 2-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Run frontend helper tests, lint, typecheck, and production build
    *   Modifications: Verified helper tests and frontend build pipeline.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `yarn lint`, `yarn typecheck`, and non-sandbox `yarn build` passed. Browser navigation to `/ai-money` redirected to `/login?next=%2Fai-money` because no authenticated local session was available.
    *   Reason: Executing follow-up plan step 5
    *   Blockers: Authenticated browser smoke test requires a valid local login session.
    *   User Confirmation Status: Pending Confirmation

# Follow-up Final Review
Implementation matches the follow-up plan. The new template "分析" action calls only the AI goal analysis endpoint through the same request path as the main form submit. It does not create strategies, enable live mode, approve wallets, or submit orders.
