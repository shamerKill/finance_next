# AI Goal Default Human Market Constraints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every AI Goal analysis includes human-behavior, market-narrative, and forbidden-scenario constraints even when the operator leaves those fields blank.

**Architecture:** Fill defaults at both boundaries: `aiGoalRequestFromFormState` for UI-originated requests and `normalizeGoalRequest` for direct API calls. The defaults remain structured arrays so prompt generation, context summaries, run memory, and future UI review surfaces share the same constraints.

**Tech Stack:** Next.js client data helpers with Node test runner; Go Echo handler tests with `go test`.

# Context

Filename: 2026-06-03-ai-goal-default-human-market-constraints.md
Created On: 2026-06-03 06:12:24 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The user wants the system to work from a high-level money-making objective where AI analyzes and generates strategies, while considering human nature, market direction, public opinion, and execution constraints. This increment makes those dimensions default structured inputs, not optional prompt decoration.

# Analysis

The AI Goal composer already fills visible default text for vague goals, but a direct request built from blank fields omitted `behaviorConstraints`, `marketNarrativeFocus`, and `avoidScenarios`. The backend normalizer also accepted empty constraint arrays. That weakened the goal-agent contract because AI could analyze a money goal without explicit FOMO, sentiment, crowding, data-gap, or mainnet-auto-order boundaries.

# Proposed Solution

Default constraints should be applied when the operator provides no structured values:

Implementation Checklist:
1. Add a frontend RED test proving blank UI constraints still produce default behavior, narrative, and avoid arrays.
2. Add a backend RED test proving direct API normalization fills the same default arrays.
3. Implement a frontend helper that returns cleaned user values or default text-derived values.
4. Add backend default arrays and fill them after request normalization when a list is empty.
5. Run targeted tests, then broader related verification.

# Task Progress

* 2026-06-03 06:12:24 CST
  * Step: 1-2. Add RED tests for blank constraints.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs` and `gateway/internal/http/handlers/ai_goal_test.go`.
  * Change Summary: Added tests that fail when AI Goal analysis lacks default human, market narrative, and avoid-scenario constraints.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:12:24 CST
  * Step: 3-4. Implement default structured constraints.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `gateway/internal/http/handlers/ai_goal.go`.
  * Change Summary: Blank constraint inputs now default to FOMO/loss-pause/overheated-market behavior checks, ETF/regulation/social-crowding narrative checks, and high-leverage/data-gap/mainnet-auto-order avoid checks.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation matches the checklist. Targeted RED tests failed before implementation because blank operator constraints were omitted. After implementation, targeted tests passed, the full AI Goal frontend suite passed with 154 tests, backend handler tests passed, `yarn typecheck` passed, `yarn lint` exited 0 with the pre-existing `client/data/use-activity-center.tsx:138` warning, and `git diff --check` passed.
