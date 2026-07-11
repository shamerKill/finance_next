# AI Goal Provider Context Watch Signal Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure valid provider AI responses still expose market-context observation signals when the provider omits `watchSignals`.

**Architecture:** Reuse the deterministic context signal generator introduced for fallback analysis. During `fillGoalAnalysisDefaults`, only backfill from context when the provider returned no watch signals, preserving explicit model output when present.

**Tech Stack:** Go Echo handler logic and Go unit tests.

# Context

Filename: 2026-06-03-ai-goal-provider-context-watch-signal-backfill.md
Created On: 2026-06-03 06:21:23 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The AI Money flow should help the user observe opportunities across market direction, public opinion, macro, on-chain data, and human behavior. A provider can return valid JSON while omitting `watchSignals`; in that case the gathered context should still be visible as actionable observation signals.

# Analysis

`parseGoalAIResponse` calls `fillGoalAnalysisDefaults` after parsing valid provider JSON. The existing default logic initialized `WatchSignals` to an empty slice but did not backfill context signals. This meant valid but incomplete provider output could hide the actual news, macro, and on-chain rows already collected for the prompt.

# Proposed Solution

Implementation Checklist:
1. Add a RED test for a valid provider response with empty `watchSignals` and non-empty news/macro/on-chain context.
2. Reuse the watch-signal test helper to assert context fragments are visible.
3. Update `fillGoalAnalysisDefaults` to call `fallbackGoalContextWatchSignals` only when `WatchSignals` is empty.
4. Run targeted and broader verification.

# Task Progress

* 2026-06-03 06:21:23 CST
  * Step: 1-2. Add RED test for provider omissions.
  * Modifications: Updated `gateway/internal/http/handlers/ai_goal_test.go`.
  * Change Summary: The test fails when valid AI JSON omits watch signals and the parser leaves the context invisible.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:21:23 CST
  * Step: 3. Backfill empty watch signals from context.
  * Modifications: Updated `gateway/internal/http/handlers/ai_goal.go`.
  * Change Summary: Empty provider watch signals now become deterministic news/macro/on-chain observation signals.
  * Reason: Executing plan step 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation matches the checklist. The RED test first failed because valid provider output with empty `watchSignals` kept the context invisible. After implementation, the targeted test passed, backend handler tests passed, the full AI Goal frontend suite passed with 155 tests, `yarn typecheck` passed, `yarn lint` exited 0 with the pre-existing `client/data/use-activity-center.tsx:138` warning, and `git diff --check` passed.
