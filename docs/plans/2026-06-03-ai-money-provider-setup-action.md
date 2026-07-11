# AI Money Provider Setup Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give users a direct AI setup action when AI Money falls back because the provider is not configured or fails.

**Architecture:** Add a reusable helper that turns fallback analysis metadata into a `/settings/ai` action. Render that action in the AI Money result callout so the user can configure and test the AI provider without hunting through settings.

**Tech Stack:** Next.js client component, shared AI Goal helper, Node test runner, TypeScript typecheck.

# Context

Filename: 2026-06-03-ai-money-provider-setup-action.md
Created On: 2026-06-03 06:32:09 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description

The project should be easy to use with AI. If the AI provider is missing, AI Money currently shows fallback analysis and a text warning. This increment turns that warning into a concrete next action: configure and test AI.

# Analysis

`aiSetupChecklistFromState` already knows `/settings/ai` is the provider setup route, but the main AI Money result callout only displayed text. Users could see "AI provider 未完成真实分析" without a visible way to fix it from the current workflow.

# Proposed Solution

Implementation Checklist:
1. Add a RED test for `aiProviderSetupPromptFromAnalysis` on fallback status.
2. Add a RED test proving the helper hides itself when provider analysis succeeds.
3. Implement the helper in `client/data/ai-goal-preset.mjs`.
4. Use the helper in `client/app/(dashboard)/ai-money/client.tsx` to render a `/settings/ai` button.
5. Run targeted and broader verification.

# Task Progress

* 2026-06-03 06:32:09 CST
  * Step: 1-2. Add RED tests.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`.
  * Change Summary: Tests require fallback status to produce a settings action and successful AI status to produce no prompt.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:32:09 CST
  * Step: 3-4. Implement setup prompt and page button.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: AI Money fallback callout now includes a "配置并测试 AI" button linking to `/settings/ai`.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 06:38:00 CST
  * Step: 5. Run targeted and broader verification.
  * Modifications: Added a JSDoc parameter shape for `aiProviderSetupPromptFromAnalysis`.
  * Change Summary: Fixed TypeScript inference at the `.mjs` to `.tsx` boundary without changing runtime behavior.
  * Reason: Executing plan step 5 after `yarn typecheck` exposed the missing parameter shape.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. The RED test failed first because `aiProviderSetupPromptFromAnalysis` did not exist, then passed after implementation. Broader verification passed with:

- `node --test client/data/ai-goal-preset.test.mjs` — 159/159 passing.
- `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1` — passing.
- `yarn typecheck` — passing after the JSDoc parameter shape correction.
- `yarn lint` — exit 0 with the existing `client/data/use-activity-center.tsx:138` unused eslint-disable warning.
- `git diff --check` — passing.
