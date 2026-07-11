# Context
Filename: 2026-06-02-ai-analysis-validation-pipeline.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Make the AI money workflow easier to use by reducing the path from a user goal to AI-generated strategy validation.

# Project Overview
The `/ai-money` workbench already accepts a money-making goal, generates AI strategy drafts, shows market / human / sentiment factors, and lets the user manually start backtests. The user wants more AI participation and less manual orchestration.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
The current workflow has separate controls for goal analysis and batch backtesting. This makes the user manually decide the next step even when the safe next step is obvious: run backtests for all runnable AI drafts. The safe boundary is important: automatic progression should stop at validation, not live trading.

# Proposed Solution
Add a tested validation-plan helper that turns an AI analysis into a safe backtest batch. Reuse it in the existing "验证全部" action and expose a new "分析并启动验证" action on the form and template rows. The action only calls the AI analysis endpoint and backtest creation endpoint.

# Implementation Plan
Implementation Checklist:
1. Add failing tests for automatic validation planning and action-update generation.
2. Implement `autoValidationPlanFromAnalysis` and `backtestActionUpdateFromValidationResult`.
3. Refactor `/ai-money` batch backtest execution to use the validation plan helper.
4. Add "分析并启动验证" and template-level "验证" controls.
5. Run helper tests, lint, typecheck, and production build.

# Current Execution Step
> Completed: "Step 5. Run helper tests, lint, typecheck, and production build"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing tests
    *   Modifications: `client/data/ai-goal-preset.test.mjs`
    *   Change Summary: Added coverage for safe validation batches, action updates from started backtests, and blocked watch-only AI output.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2-4. Implement and wire automatic safe validation
    *   Modifications: `client/data/ai-goal-preset.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: Added validation-plan helpers, reused them in batch backtests, and added form/template controls that analyze then start backtest validation.
    *   Reason: Executing plan steps 2-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Run helper tests, lint, typecheck, and production build
    *   Modifications: Verified helper tests, frontend lint/typecheck/build, and local auth redirect smoke.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `git diff --check`, `yarn lint`, `yarn typecheck`, and non-sandbox `yarn build` passed. Browser navigation to `/ai-money` redirected to `/login?next=%2Fai-money` because no authenticated local session was available.
    *   Reason: Executing plan step 5
    *   Blockers: Authenticated browser click-through requires a valid local login session.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. The new automatic path only performs AI goal analysis and backtest validation; it does not create persisted strategies, enable live mode, approve wallets, or submit trading orders.
