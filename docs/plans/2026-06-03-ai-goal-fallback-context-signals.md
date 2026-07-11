# AI Goal Fallback Context Signals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Goal fallback analysis useful when the AI provider is unavailable by turning available market context into concrete observation signals.

**Architecture:** Keep the existing conservative fallback blueprint and safety gates. Add deterministic watch-signal generation from the already gathered `aiGoalContext` news, macro, and on-chain snapshots so the operator still sees what to observe and why.

**Tech Stack:** Go Echo handler logic and Go unit tests.

# Context

Filename: 2026-06-03-ai-goal-fallback-context-signals.md
Created On: 2026-06-03 06:19:23 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The project should let the user provide a goal and have AI help analyze opportunities across trading, human behavior, market direction, and public opinion. When the AI provider is not configured, the fallback path should still make the gathered context visible and actionable instead of returning only static guidance.

# Analysis

`buildGoalPrompt` already includes recent news, macro, and on-chain rows for provider-backed analysis. `fallbackGoalAnalysis` had conservative static watch signals but did not convert the same context into user-visible watch signals. That made no-provider local usage weaker than the rest of the AI Money flow.

# Proposed Solution

Generate fallback watch signals from:

Implementation Checklist:
1. Add a RED test proving fallback output includes a real news title, macro code, and on-chain metric from `aiGoalContext`.
2. Add a test helper that searches all watch-signal fields for a fragment.
3. Implement `fallbackGoalContextWatchSignals`.
4. Append generated context signals to the existing fallback watch signals.
5. Run targeted and broader verification.

# Task Progress

* 2026-06-03 06:19:23 CST
  * Step: 1-2. Add RED test and helper.
  * Modifications: Updated `gateway/internal/http/handlers/ai_goal_test.go`.
  * Change Summary: The test fails when fallback watch signals omit the news title, macro code, or on-chain metric from context.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:19:23 CST
  * Step: 3-4. Implement context watch signals.
  * Modifications: Updated `gateway/internal/http/handlers/ai_goal.go`.
  * Change Summary: Fallback now surfaces recent news, macro, and on-chain snapshots as watch signals with interpretation and action guidance.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation matches the checklist. The RED test first failed because fallback watch signals only contained static news/macro guidance. After implementation, the targeted test passed, backend handler tests passed, the full AI Goal frontend suite passed with 155 tests, `yarn typecheck` passed, `yarn lint` exited 0 with the pre-existing `client/data/use-activity-center.tsx:138` warning, and `git diff --check` passed.
