# AI Money Provider Gate All Entrypoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every AI Money analysis entrypoint respects the real-AI provider readiness gate instead of allowing fallback runs through secondary buttons.

**Architecture:** Add a pure helper that turns the provider readiness gate into an analysis-attempt decision. The AI Money client will use that decision before every direct call to `runGoalAnalysis()` or `analyzeAndValidateGoal()`.

**Tech Stack:** Next.js client component, TypeScript, Node test runner for `.mjs` helper behavior.

# Context
Filename: 2026-06-03-ai-money-provider-gate-all-entrypoints.md
Created On: 2026-06-03 12:11:06 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The previous provider readiness stage added a gate and blocked the main analyze and daily radar paths. Current code still has secondary analysis paths that can bypass the gate: template analysis, template validation, composer analyze-and-validate, refresh run, and direct form secondary analysis.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches AI Money frontend behavior and the pure AI goal helper/test file.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
Relevant files:

`client/data/ai-goal-preset.mjs` already exports `aiProviderReadinessGateFromStatus()`.

`client/data/ai-goal-preset.test.mjs` already has adjacent provider readiness tests.

`client/app/(dashboard)/ai-money/client.tsx` uses `providerGate` in `onAnalyzeAndValidate()` and `onDailyRadarScan()`, but several direct handlers still call `runGoalAnalysis()` or `analyzeAndValidateGoal()` without checking the provider gate.

# Proposed Solution
Add `aiProviderAnalysisAttemptFromGate(gate)`. It returns `{kind:"redirect", href, label}` when `gate.blockManualAnalysis` is true; otherwise it returns `{kind:"allow"}`. Then AI Money defines a local `redirectIfProviderBlocksAnalysis()` helper and calls it before every direct analysis entrypoint.

# Implementation Plan

### Task 1: Add RED Tests For Analysis Attempt Gate

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1:** Import `aiProviderAnalysisAttemptFromGate`.

**Step 2:** Add tests near provider readiness tests:
- blocked gate returns redirect to `/settings/ai`;
- ready or unknown gate returns allow.

**Step 3:** Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiProviderAnalysisAttemptFromGate` is not exported.

### Task 2: Implement Pure Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1:** Add `aiProviderAnalysisAttemptFromGate(gate = null)` after `aiProviderReadinessGateFromStatus()`.

**Step 2:** Return redirect only when `gate.blockManualAnalysis` is true.

**Step 3:** Run focused Node test and expect PASS.

### Task 3: Wire All AI Money Analysis Entrypoints

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Import `aiProviderAnalysisAttemptFromGate`.

**Step 2:** Add a typed wrapper and local `redirectIfProviderBlocksAnalysis()`.

**Step 3:** Replace direct gate checks in `onAnalyzeAndValidate()` and `onDailyRadarScan()` with the local helper.

**Step 4:** Add the local helper to `refreshRun()` before it calls `analyzeAndValidateGoal()`.

**Step 5:** Add the local helper to `analyzeGoalTemplate()`, `validateGoalTemplate()`, the composer `onAnalyzeAndValidate`, and the form secondary analysis button.

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: JS tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add failing tests for `aiProviderAnalysisAttemptFromGate`.
2. Run focused Node test and confirm missing export failure.
3. Implement `aiProviderAnalysisAttemptFromGate()`.
4. Run focused Node test and confirm pass.
5. Import and type the helper in AI Money client.
6. Gate all direct AI analysis entrypoints with the helper.
7. Run JS tests, typecheck, lint, and `git diff --check`.
8. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:12:28 +0800
    *   Step: 1. Add failing tests for `aiProviderAnalysisAttemptFromGate`; 2. Run focused Node test and confirm missing export failure.
    *   Modifications: Added provider analysis attempt tests for blocked, ready, and unknown provider states.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './ai-goal-preset.mjs' does not provide an export named 'aiProviderAnalysisAttemptFromGate'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:13:04 +0800
    *   Step: 3. Implement `aiProviderAnalysisAttemptFromGate()`; 4. Run focused Node test and confirm pass.
    *   Modifications: Added `aiProviderAnalysisAttemptFromGate()` after the provider readiness gate helper.
    *   Change Summary: GREEN confirmed with 216 passing `ai-goal-preset` tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:15:26 +0800
    *   Step: 5. Import and type the helper in AI Money client; 6. Gate all direct AI analysis entrypoints with the helper.
    *   Modifications: Added `buildProviderAnalysisAttempt`, local `redirectIfProviderBlocksAnalysis()`, and routed main analyze, daily scan, run refresh, template analyze/validate, composer analyze-and-validate, and secondary form analysis through the gate.
    *   Change Summary: All visible AI Money analysis entrypoints now share the same provider readiness gate before creating an AI analysis run.
    *   Reason: Executing plan steps 5-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:17:03 +0800
    *   Step: 7. Run JS tests, typecheck, lint, and `git diff --check`; 8. Update Task Progress and Final Review in this document.
    *   Modifications: Verified focused JS helper/workflow tests, TypeScript typecheck, frontend lint, and whitespace diff validation; updated this execution record and final review.
    *   Change Summary: Verification passed with 218 JS tests, `yarn typecheck`, `yarn lint`, and `git diff --check`. Lint still reports only the known existing warning in `client/data/use-activity-center.tsx:138`.
    *   Reason: Executing plan steps 7-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-8 were completed. The new pure provider-analysis helper is covered by RED/GREEN tests, and all direct AI Money analysis entrypoints now call the shared provider gate before creating or validating analysis runs.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.
