# AI Frontend Default Actions Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep frontend preview-seeded AI goal actions aligned with the backend default action contract.

**Architecture:** The backend now requires paper review evidence before any testnet or mainnet promotion. The frontend `defaultAIGoalRunActionsFromAnalysis` helper must seed the same `paper_watch` and blocked `gate` actions so local previews and persisted runs behave consistently.

**Tech Stack:** Next.js helper module, Node test runner.

## Analysis

`gateway/internal/http/handlers/ai_goal.go::defaultGoalRunActions` appends a blocked `paper_watch` action for tradable drafts and always appends a blocked `gate` action that mentions paper review evidence. `client/data/ai-goal-preset.mjs::defaultAIGoalRunActionsFromAnalysis` still skipped `paper_watch` and marked gate as manual for testnet/mainnet modes, creating a frontend/backend contract mismatch.

## Implementation Checklist

1. Update `client/data/ai-goal-preset.test.mjs` so `defaultAIGoalRunActionsFromAnalysis` expects `paper_watch` before `gate` for tradable drafts.
2. Add assertions that the `paper_watch` note contains 24-72 hour review, market direction, sentiment, human bias, and execution friction requirements.
3. Add an assertion that watch-only drafts do not create `paper_watch`.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED failure against the old frontend behavior.
5. Update `client/data/ai-goal-preset.mjs` to append blocked `paper_watch` only for tradable drafts.
6. Update the frontend gate action to always stay blocked and mention paper review evidence.
7. Run `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`.

## Task Progress

* 2026-06-03
  * Step: Frontend default action contract sync.
  * Modifications: Updated helper tests and helper action generation.
  * Change Summary: Frontend previews now include the same paper evidence gate as backend persisted AI goal runs.
  * Reason: Prevent users from seeing a premature execution gate before paper observation evidence exists.
  * Blockers: None.

## Final Review

Implementation matches the plan. The RED test failed because `paper_watch` was missing and gate was manual. After the helper update, the targeted Node test suite passed with 131/131 tests. Frontend typecheck passed. Frontend lint exited 0 with the existing `client/data/use-activity-center.tsx` unused eslint-disable warning.
