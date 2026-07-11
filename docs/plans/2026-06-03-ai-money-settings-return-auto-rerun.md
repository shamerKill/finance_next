# AI Money Settings Return Auto Re-Run Implementation Plan

**Goal:** Automatically re-run AI Money analysis once after returning from AI configuration with `?intent=rerun_ai`, so newly configured real AI immediately replaces old fallback or stale judgment.

**Architecture:** Add a pure settings-return auto-run decision helper. The AI Money client uses a ref-backed one-shot effect to call the existing `onDailyRadarScan()` path when provider readiness is unblocked and the page is idle. The normal auto daily radar effect is skipped while this explicit settings-return intent is active to avoid duplicate scans.

**Tech Stack:** Next.js client component, plain `.mjs` AI helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-settings-return-auto-rerun.md
Created On: 2026-06-03 12:45:25 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
`/settings/ai` sends users back to `/ai-money?intent=rerun_ai`, but AI Money currently only shows a prompt button. If the user just configured a real provider, they still have to click again to replace old fallback analysis. The goal is to make AI participation more automatic after setup.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches AI Money frontend behavior and pure helper tests.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/data/ai-goal-preset.mjs` has `aiSettingsReturnPromptFromSearch()` for the visible prompt.

`client/app/(dashboard)/ai-money/client.tsx` reads `requestedIntent` and renders the prompt, but no effect automatically runs it.

`autoDailyRadarDecision()` will not run when today's radar is fresh, which is reasonable for normal page visits but not for the explicit post-AI-config return path.

# Proposed Solution

Add `aiSettingsReturnAutoRunDecision({ intent, busy, providerBlocked, lastKey })`. It returns a one-shot `{shouldRun:true,key:"settings_return:rerun_ai"}` only for `intent=rerun_ai` when the page is idle, provider readiness is unblocked, and the key has not already been triggered.

Wire the client with a ref-backed effect that calls `onDailyRadarScan()` once. Skip the normal auto daily radar effect while `intent=rerun_ai` is active to prevent duplicate runs.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
- Import `aiSettingsReturnAutoRunDecision`.
- Assert `intent=rerun_ai`, idle, provider unblocked returns `shouldRun=true`.
- Assert no intent, busy, provider blocked, and already-triggered states return `shouldRun=false`.
- Run `node --test client/data/ai-goal-preset.test.mjs` and confirm missing export failure.

### Task 2: Implement Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
- Add `aiSettingsReturnAutoRunDecision()` next to settings return prompt / auto daily radar helpers.
- Use a stable key `settings_return:rerun_ai`.
- Run focused Node test and confirm pass.

### Task 3: Wire AI Money Client

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
- Import and type `aiSettingsReturnAutoRunDecision`.
- Add `settingsReturnAutoRunKeyRef`.
- Add an effect that calls `onDailyRadarScan()` once when decision says ready.
- Skip regular auto daily radar while `requestedIntent === "rerun_ai"`.

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: AI helper tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add failing tests for `aiSettingsReturnAutoRunDecision()`.
2. Run focused Node test and confirm missing export failure.
3. Implement `aiSettingsReturnAutoRunDecision()`.
4. Run focused Node test and confirm pass.
5. Wire AI Money client one-shot settings return auto-run.
6. Skip regular auto daily radar during `rerun_ai` intent.
7. Run Node test, typecheck, lint, and `git diff --check`.
8. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:47:29 +0800
    *   Step: 1. Add failing tests for `aiSettingsReturnAutoRunDecision()`; 2. Run focused Node test and confirm missing export failure.
    *   Modifications: Added tests for ready, already-triggered, no-intent, busy, and provider-blocked settings-return auto-run states.
    *   Change Summary: RED confirmed with missing `aiSettingsReturnAutoRunDecision` export.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:47:29 +0800
    *   Step: 3. Implement `aiSettingsReturnAutoRunDecision()`; 4. Run focused Node test and confirm pass.
    *   Modifications: Added the one-shot settings-return auto-run helper next to settings return prompt / auto radar helpers.
    *   Change Summary: GREEN confirmed with 218 passing AI goal preset tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:47:29 +0800
    *   Step: 5. Wire AI Money client one-shot settings return auto-run; 6. Skip regular auto daily radar during `rerun_ai` intent.
    *   Modifications: Imported and typed `aiSettingsReturnAutoRunDecision`, added `settingsReturnAutoRunKeyRef`, added a one-shot effect that calls `onDailyRadarScan()`, and made the regular auto radar effect skip explicit settings-return intent.
    *   Change Summary: Returning from AI settings with `?intent=rerun_ai` now triggers one automatic re-analysis when provider readiness is unblocked.
    *   Reason: Executing plan steps 5-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:47:29 +0800
    *   Step: 7. Run Node test, typecheck, lint, and `git diff --check`; 8. Update Task Progress and Final Review in this document.
    *   Modifications: Verified focused AI helper tests, frontend typecheck, frontend lint, and whitespace diff validation; updated this execution record and final review.
    *   Change Summary: Verification passed. Lint still reports only the known existing warning in `client/data/use-activity-center.tsx:138`.
    *   Reason: Executing plan steps 7-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-8 were completed. The settings-return auto-run decision is tested, and AI Money now automatically re-runs analysis once after returning from AI settings with `intent=rerun_ai`, while avoiding duplicate normal auto-radar scans.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.
