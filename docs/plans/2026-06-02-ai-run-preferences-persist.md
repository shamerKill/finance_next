# Context
Filename: 2026-06-02-ai-run-preferences-persist.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Persist and restore AI goal run horizon and risk preference so historical runs can be reused without losing the original time window and risk intent.

# Project Overview
The `/ai-money` workflow can reopen historical AI goal runs and restore goal, symbols, and execution mode. The form still lost `horizon` and `riskPreference` because these fields were not persisted in `ai_goal_runs`.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
`aiGoalAnalyzeRequest` already contains `Horizon` and `RiskPreference`, but `AIGoalRunDoc` and `goalRunPreviewFromAnalysis` did not store them. The frontend helper `formStateFromAIGoalRun` therefore had no source for those fields.

# Proposed Solution
Add `horizon` and `riskPreference` to `AIGoalRunDoc`, copy them from the normalized request when saving a run, expose them in the client type, and restore them in the form helper.

# Implementation Plan
Implementation Checklist:
1. Add backend test coverage for preview preference copying.
2. Add frontend helper coverage for restoring horizon and risk preference.
3. Add fields to Mongo run doc and backend preview generation.
4. Add client type fields and restore logic.
5. Run frontend and backend verification.

# Current Execution Step
> Currently executing: "Step 5. Run frontend and backend verification"

# Task Progress
*   2026-06-02
    *   Step: 1-4. Persist and restore AI run preferences
    *   Modifications: `gateway/internal/store/mongo/ai_goal_repo.go`, `gateway/internal/http/handlers/ai_goal.go`, `gateway/internal/http/handlers/ai_goal_test.go`, `client/data/type.d.ts`, `client/data/ai-goal-preset.mjs`, `client/data/ai-goal-preset.test.mjs`, `client/app/(dashboard)/ai-money/client.tsx`
    *   Change Summary: Saved AI goal runs now carry horizon and risk preference; opening a historical run restores those fields into the form.
    *   Reason: Executing plan steps 1-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Run frontend and backend verification
    *   Modifications: Verified frontend helper tests, frontend lint/typecheck/build, and backend AI goal handler tests.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs`, `yarn lint`, `yarn typecheck`, `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-cache go test ./internal/http/handlers -run 'TestAIGoal'`, and non-sandbox `yarn build` passed.
    *   Reason: Executing plan step 5
    *   Blockers: Sandbox `yarn build` cannot fetch Google Fonts; non-sandbox build passed.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan. Persisted preferences only restore form inputs for reuse and do not trigger analysis, strategy creation, live trading, or order submission.
