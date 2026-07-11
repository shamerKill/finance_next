# AI Settings AI Money Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/settings/ai` an actionable continuation point for AI Money users who need to configure, test, and then rerun AI analysis.

**Architecture:** Add a small shared helper that summarizes the current AI provider readiness for AI Money. Render that summary near the top of the AI settings page with an edit/test path when the active provider key is missing and a return-to-AI-Money path when the provider is configured.

**Tech Stack:** Next.js client component, plain JavaScript helper, Node test runner, TypeScript typecheck, ESLint.

# Context

Filename: 2026-06-03-ai-settings-ai-money-loop.md
Created On: 2026-06-03 06:45:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

AI Money can now send fallback users to `/settings/ai`, but the settings page itself still reads like a generic admin configuration page. The page should make the AI Money continuation obvious: configure the active provider, test the saved connection, then return to AI Money to rerun the goal analysis.

# Analysis

`client/app/(dashboard)/settings/ai/client.tsx` already loads `TypeAIConfig` and renders `AIConfigEditButton`, which opens the modal containing per-provider "测试连接" buttons. `client/data/ai-goal-preset.mjs` already links fallback AI Money analysis to `/settings/ai`. The missing piece is a reusable readiness summary that can drive UI copy and action routing from the settings side.

# Proposed Solution

Implementation Checklist:
1. Create RED tests for an AI settings workflow helper: active provider missing key should produce a blocked state with an edit/test action.
2. Create RED test for a configured active provider: should produce a ready state with a `/ai-money` return action.
3. Implement `client/data/ai-settings-workflow.mjs`.
4. Import the helper in `client/app/(dashboard)/settings/ai/client.tsx` and render a top callout when config is loaded.
5. Run targeted tests and broader verification.

# Task Progress

* 2026-06-03 06:45:00 CST
  * Step: 1-2. Add RED tests.
  * Modifications: Created `client/data/ai-settings-workflow.test.mjs`.
  * Change Summary: Tests require missing active provider keys to block AI Money and configured active providers to return users to `/ai-money`.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:47:00 CST
  * Step: 3. Implement workflow helper.
  * Modifications: Created `client/data/ai-settings-workflow.mjs`.
  * Change Summary: Helper maps `modelFamily` to the active provider key/model fields and returns blocked or ready workflow state.
  * Reason: Executing plan step 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:49:00 CST
  * Step: 4. Render AI Money continuation callout.
  * Modifications: Updated `client/app/(dashboard)/settings/ai/client.tsx`.
  * Change Summary: Settings AI now shows a top callout with provider readiness, edit/test guidance, and a return-to-AI-Money action when configured.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:50:00 CST
  * Step: 5. Run targeted and broader verification.
  * Modifications: None.
  * Change Summary: Verified helper tests, AI Goal helper tests, gateway handler tests, frontend typecheck, lint, and whitespace checks.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. The RED run first failed because `client/data/ai-settings-workflow.mjs` did not exist, then failed on behavior with an empty helper, and passed after implementation.

- `node --test client/data/ai-settings-workflow.test.mjs` — 2/2 passing.
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` — 161/161 passing.
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1` — passing.
- `yarn typecheck` — passing.
- `yarn lint` — exit 0 with the existing `client/data/use-activity-center.tsx:138` unused eslint-disable warning.
- `git diff --check` — passing.
- `yarn dev` — Next dev server started at `http://localhost:3000` after sandbox escalation for local port binding.
- `curl -I http://localhost:3000/settings/ai` and `curl -I http://localhost:3000/ai-money` — both returned 307 redirects to `/login?next=...`, confirming the routes respond under auth middleware in the unauthenticated local session.
