# AI Settings Rerun Intent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After AI provider setup, return users to AI Money with a concrete rerun-analysis intent instead of a generic page visit.

**Architecture:** Keep the feature as URL-driven state. `/settings/ai` links ready users to `/ai-money?intent=rerun_ai`; AI Money parses that intent into a small callout that triggers the existing daily scan flow. No backend changes are needed.

**Tech Stack:** Next.js client components, plain JavaScript helpers, Node test runner, TypeScript typecheck, ESLint.

# Context

Filename: 2026-06-03-ai-settings-rerun-intent.md
Created On: 2026-06-03 06:58:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The user wants the project to make AI participation higher and easier to use. AI settings now points back to AI Money, but the return path is still passive. This increment makes the return path actionable: after provider configuration, AI Money can immediately guide the user to rerun the market / sentiment / strategy scan.

# Analysis

`client/data/ai-settings-workflow.mjs` currently returns `/ai-money` for configured providers. `client/app/(dashboard)/ai-money/client.tsx` already parses `useSearchParams()`, has `runDailyRadar()`, and renders several top panels. A small helper can turn `intent=rerun_ai` plus current daily radar status into UI copy and a `scan_today` / `rescan_today` action.

# Proposed Solution

Implementation Checklist:
1. Add a RED test requiring configured AI settings workflow to return `/ai-money?intent=rerun_ai`.
2. Add RED tests for `aiSettingsReturnPromptFromSearch`: no prompt without intent, ready rescan prompt with intent.
3. Implement `aiSettingsReturnPromptFromSearch` in `client/data/ai-goal-preset.mjs`.
4. Import and render the prompt in `client/app/(dashboard)/ai-money/client.tsx`, wiring its primary action to `runDailyRadar`.
5. Run targeted tests and broader verification.

# Task Progress

* 2026-06-03 06:58:00 CST
  * Step: 1. Add RED test for settings ready href.
  * Modifications: Updated `client/data/ai-settings-workflow.test.mjs`.
  * Change Summary: The ready provider workflow must return `/ai-money?intent=rerun_ai`.
  * Reason: Executing plan step 1.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:00:00 CST
  * Step: 2. Add RED tests for AI Money rerun intent.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`.
  * Change Summary: Tests require `aiSettingsReturnPromptFromSearch` to stay hidden without intent and to produce a scan action with `intent=rerun_ai`.
  * Reason: Executing plan step 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:02:00 CST
  * Step: 3. Implement helpers.
  * Modifications: Updated `client/data/ai-settings-workflow.mjs` and `client/data/ai-goal-preset.mjs`.
  * Change Summary: Settings ready state now links with rerun intent; AI Money can turn that intent into a one-click rescan prompt.
  * Reason: Executing plan step 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:04:00 CST
  * Step: 4. Render prompt in AI Money.
  * Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: AI Money shows an actionable callout after returning from AI settings and wires it to the existing daily radar scan pipeline.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:05:00 CST
  * Step: 5. Run verification.
  * Modifications: None.
  * Change Summary: Verified targeted RED/GREEN tests, full AI helper tests, gateway handler tests, frontend typecheck, lint, and whitespace checks.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. The first RED run failed on `/ai-money` vs `/ai-money?intent=rerun_ai`; the second RED run failed because `aiSettingsReturnPromptFromSearch` was not exported. Both passed after implementation.

- `node --test --test-name-pattern "aiSettingsReturnPromptFromSearch" client/data/ai-goal-preset.test.mjs` — 2/2 passing.
- `node --test client/data/ai-settings-workflow.test.mjs` — 2/2 passing.
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` — 163/163 passing.
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1` — passing.
- `yarn typecheck` — passing.
- `yarn lint` — exit 0 with the existing `client/data/use-activity-center.tsx:138` unused eslint-disable warning.
- `git diff --check` — passing.
