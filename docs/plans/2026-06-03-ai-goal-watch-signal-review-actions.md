# AI Goal Watch Signal Review Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn AI watch signals into concrete human review tasks with the signal, interpretation, and recommended action visible in the AI Money workflow.

**Architecture:** Format watch signals consistently in the frontend action plan, frontend default run action mirror, and backend persisted run actions. The AI can still generate watch signals freely, but the operator sees what to review, why it matters, and what action boundary to apply.

**Tech Stack:** Client-side AI Goal helper tests with Node test runner; Go handler tests for backend run action previews.

# Context

Filename: 2026-06-03-ai-goal-watch-signal-review-actions.md
Created On: 2026-06-03 06:27:44 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The user wants AI to participate more and make the product easier to observe and use. AI watch signals were already generated from provider output or fallback context, but the handoff task could collapse them into a generic sentiment review or a bare signal name.

# Analysis

`actionPlanFromAnalysis` treated balanced watch signals as already done, so neutral but still relevant market observations did not become an explicit review step. `defaultAIGoalRunActionsFromAnalysis` and backend `defaultGoalRunActions` used only the first signal name when no human factor existed, losing `interpretation` and `action`.

# Proposed Solution

Implementation Checklist:
1. Add frontend RED tests proving action plan and default run actions include watch signal interpretation and action.
2. Add backend RED test proving persisted run action notes include watch signal interpretation and action.
3. Add frontend watch-signal review formatting and use it in both action plan and default run actions.
4. Add backend watch-signal review formatting and use it in default run actions.
5. Run targeted tests, then broader verification.

# Task Progress

* 2026-06-03 06:27:44 CST
  * Step: 1-2. Add RED tests.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs` and `gateway/internal/http/handlers/ai_goal_test.go`.
  * Change Summary: Tests fail when signal `interpretation` and `action` are not visible in review tasks.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:27:44 CST
  * Step: 3-4. Format watch signals as review actions.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `gateway/internal/http/handlers/ai_goal.go`.
  * Change Summary: Sentiment review tasks now include the signal, its meaning, and the suggested safe action such as paper-only observation.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation matches the checklist. The RED tests first failed because neutral watch signals were treated as done in the action plan and persisted run action notes only kept the signal name. After implementation, targeted tests passed, the full AI Goal frontend suite passed with 157 tests, backend handler tests passed, `yarn typecheck` passed, `yarn lint` exited 0 with the pre-existing `client/data/use-activity-center.tsx:138` warning, and `git diff --check` passed.
