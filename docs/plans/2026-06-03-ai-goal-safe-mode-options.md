# AI Goal Safe Mode Options Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money goal input easier and safer by exposing only observe and paper execution modes at the initial goal-analysis stage.

**Architecture:** Move the safe execution-mode option list into the AI Goal preset helper and reuse it from the AI Money page. Request normalization still protects raw inputs, while the UI no longer suggests that goal submission can directly enter testnet or mainnet.

**Tech Stack:** Next.js client component, shared client data helper, Node test runner, TypeScript typecheck.

# Context

Filename: 2026-06-03-ai-goal-safe-mode-options.md
Created On: 2026-06-03 06:14:34 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The user wants a simpler AI-first product flow: provide a goal, let AI analyze and validate, and avoid confusing manual trading controls. Showing testnet/mainnet in the initial AI goal form conflicted with the existing safety behavior that caps requests to observe/paper.

# Analysis

`client/app/(dashboard)/ai-money/client.tsx` had a local `MODE_OPTIONS` list containing `observe`, `paper`, `testnet`, and `mainnet`. The request builder and backend now cap unsafe requested modes, so the UI was more permissive than the actual product boundary.

# Proposed Solution

Expose a shared `AI_GOAL_EXECUTION_MODE_OPTIONS` constant with only `observe` and `paper`, test it, and replace the page-local options. Later stages can still surface `testnet_ready` or mainnet gates after validation evidence.

# Implementation Plan

Implementation Checklist:
1. Add a RED test proving `AI_GOAL_EXECUTION_MODE_OPTIONS` only contains `observe` and `paper`.
2. Export `AI_GOAL_EXECUTION_MODE_OPTIONS` from `client/data/ai-goal-preset.mjs`.
3. Replace the AI Money page-local `MODE_OPTIONS` with the shared safe options.
4. Run targeted test and broader frontend verification.

# Task Progress

* 2026-06-03 06:14:34 CST
  * Step: 1. Add RED test.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`.
  * Change Summary: The test fails when the safe execution-mode options are missing or include `testnet`/`mainnet`.
  * Reason: Executing plan step 1.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:14:34 CST
  * Step: 2-3. Export and use safe mode options.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: The initial AI Money execution-mode select now only exposes observe and paper.
  * Reason: Executing plan steps 2-3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation matches the checklist. The RED test first failed because `AI_GOAL_EXECUTION_MODE_OPTIONS` did not exist. After implementation, the targeted test passed, the full AI Goal frontend suite passed with 155 tests, `yarn typecheck` passed, `yarn lint` exited 0 with the pre-existing `client/data/use-activity-center.tsx:138` warning, and `git diff --check` passed.
