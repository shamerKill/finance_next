# AI Goal Risk Preference Cap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent unsafe or unknown risk preference text from reaching AI Goal analysis as an accepted risk level.

**Architecture:** Normalize `riskPreference` at both request boundaries. The frontend request builder protects normal UI usage, while the Go request normalizer protects direct API calls and persisted AI run records.

**Tech Stack:** Next.js client data helpers with Node test runner; Go Echo handler tests with `go test`.

# Context

Filename: 2026-06-03-ai-goal-risk-preference-cap.md
Created On: 2026-06-03 06:09:23 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The project should be easier to use for goal-driven AI strategy analysis, while keeping AI involvement bounded by human behavior, market narrative, and risk controls. This increment closes a direct input gap where `riskPreference` could preserve arbitrary values such as `all-in`.

# Analysis

The frontend already caps unsafe `executionMode` values to `paper`, but `aiGoalRequestFromFormState` preserved any `riskPreference` text after trimming. The backend `normalizeGoalRequest` had the same issue: it defaulted empty risk to `balanced` but preserved unknown non-empty values. That meant direct API requests could inject unrecognized risk labels into prompts and run records.

# Proposed Solution

The safest narrow change is to accept only the existing product risk levels: `conservative`, `balanced`, and `aggressive`. Blank or unknown values fall back to `balanced`. This keeps the current UI options intact while preventing arbitrary high-risk wording from becoming a first-class AI analysis setting.

# Implementation Plan

Implementation Checklist:
1. Add a frontend RED test proving `aiGoalRequestFromFormState` maps unknown and blank risk preferences to `balanced`.
2. Add a backend RED test proving `normalizeGoalRequest` maps unknown and blank risk preferences to `balanced`.
3. Add `safeRiskPreferenceForGoal` in `client/data/ai-goal-preset.mjs` and use it in the composer and request builder.
4. Add `safeGoalRiskPreference` in `gateway/internal/http/handlers/ai_goal.go` and use it in `normalizeGoalRequest`.
5. Run targeted frontend and backend tests.
6. Run broader frontend/backend verification.

# Task Progress

* 2026-06-03 06:09:23 CST
  * Step: 1-2. Add RED tests for unsafe risk preferences.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs` and `gateway/internal/http/handlers/ai_goal_test.go`.
  * Change Summary: Added tests for unknown, blank, and known risk preference normalization.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:09:23 CST
  * Step: 3-4. Implement minimal risk preference normalization.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `gateway/internal/http/handlers/ai_goal.go`.
  * Change Summary: Frontend and backend now accept only `conservative`, `balanced`, or `aggressive`; other values become `balanced`.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation matches the checklist. Targeted RED tests failed before implementation for the expected reason: `all-in` was preserved as a risk preference. After implementation, targeted tests passed, the full AI Goal frontend test suite passed, backend handler tests passed, `yarn typecheck` passed, `yarn lint` exited 0 with the pre-existing `client/data/use-activity-center.tsx:138` warning, and `git diff --check` passed.
