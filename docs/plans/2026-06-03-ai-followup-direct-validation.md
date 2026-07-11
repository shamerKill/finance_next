# AI Followup Direct Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users validate a historical AI run directly from the AI follow-up queue when AI has generated strategy blueprints that still need backtests.

**Architecture:** Promote `run_validation` follow-up items to a `validate_run` primary action instead of only `open_run`. The AI Money client will fetch that run, restore its analysis/form state, and reuse the existing `runValidationBacktests` pipeline.

**Tech Stack:** Next.js client component, shared AI Goal helper, Node test runner, TypeScript typecheck, ESLint.

# Context

Filename: 2026-06-03-ai-followup-direct-validation.md
Created On: 2026-06-03 07:14:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The user's goal is to make AI participation stronger and easier to operate. The AI follow-up queue can identify historical AI runs with strategy drafts that need validation, but its primary action currently opens the run. This still leaves the user to decide and click again. This increment makes the queue directly launch validation for those runs.

# Analysis

`aiRunFollowupQueueFromRuns` already identifies `run_validation` items for active backtest actions and for runs with `strategyDraftCount > 0`. `client/app/(dashboard)/ai-money/client.tsx` already has `openRun`, `runValidationBacktests`, and `getAIGoalRun`, so the page can load a historical run and trigger existing validation without backend changes.

# Proposed Solution

Implementation Checklist:
1. Add a RED test requiring `aiRunFollowupQueueFromRuns` to return `primaryAction.kind = "validate_run"` when the highest priority item is `run_validation`.
2. Implement the helper change in `client/data/ai-goal-preset.mjs`.
3. Add `validate_run` to the AI Money follow-up queue UI types and button handling.
4. Implement `validateRun` in `client/app/(dashboard)/ai-money/client.tsx`, using `getAIGoalRun`, `formStateFromAIGoalRun`, `applyFormState`, and `runValidationBacktests`.
5. Run targeted tests and broader verification.

# Task Progress

* 2026-06-03 07:14:00 CST
  * Step: 1. Add RED test.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`.
  * Change Summary: The test requires unvalidated AI blueprints to produce a `validate_run` primary action.
  * Reason: Executing plan step 1.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:16:00 CST
  * Step: 2. Implement helper change.
  * Modifications: Updated `client/data/ai-goal-preset.mjs`.
  * Change Summary: `aiRunFollowupQueueFromRuns` now promotes top `run_validation` items to `validate_run`.
  * Reason: Executing plan step 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:18:00 CST
  * Step: 3-4. Wire UI action.
  * Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: The follow-up queue can now load a historical AI run and launch the existing batch backtest validation pipeline directly.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:20:00 CST
  * Step: 5. Run verification.
  * Modifications: None.
  * Change Summary: Verified targeted follow-up queue behavior, full AI helper tests, gateway handler tests, frontend typecheck, lint, and whitespace checks.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. The RED test failed first because `aiRunFollowupQueueFromRuns` returned `open_run` / `打开最高优先级运行`; after the helper change it returned `validate_run` / `验证此 AI 运行`.

- `node --test --test-name-pattern "directly validateable" client/data/ai-goal-preset.test.mjs` — passing.
- `node --test --test-name-pattern "aiRunFollowupQueueFromRuns" client/data/ai-goal-preset.test.mjs` — 6/6 passing.
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` — 164/164 passing.
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1` — passing.
- `yarn typecheck` — passing.
- `yarn lint` — exit 0 with the existing `client/data/use-activity-center.tsx:138` unused eslint-disable warning.
- `git diff --check` — passing.
