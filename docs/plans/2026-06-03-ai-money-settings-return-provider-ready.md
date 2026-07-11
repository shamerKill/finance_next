# AI Money Settings Return Provider Ready Implementation Plan

**Goal:** Ensure the post-AI-settings automatic re-run only starts after the real AI provider is confirmed ready, avoiding accidental fallback analysis when provider status is unknown.

**Architecture:** Tighten the pure settings-return auto-run decision helper with an explicit `providerReady` requirement. The AI Money client will pass `providerGate.stage === "ready"` while preserving the existing manual/unknown provider behavior elsewhere.

**Tech Stack:** Next.js client component, plain `.mjs` AI helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-settings-return-provider-ready.md
Created On: 2026-06-03 12:49:00 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The settings-return auto re-run currently treats "not blocked" as safe. When provider status is unknown or unavailable, that can still trigger a run and produce fallback analysis. The explicit `/ai-money?intent=rerun_ai` path should wait for confirmed provider readiness.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches AI Money frontend behavior and helper tests.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`aiProviderReadinessGateFromStatus()` returns `stage: "unknown"` and `blockAutoRadar: false` when provider status is unavailable.

`aiSettingsReturnAutoRunDecision()` currently receives only `providerBlocked`, so unknown provider status can still auto-run.

Manual analysis behavior intentionally remains less strict for existing flows; this task only tightens the explicit auto-run path after AI settings.

# Proposed Solution

Add `providerReady` to `aiSettingsReturnAutoRunDecision()`. It returns `reason: "provider_not_ready"` unless `providerReady === true`. Existing blocked state remains `reason: "provider_blocked"` for clearer diagnostics.

The client passes `providerGate.stage === "ready"` into the decision helper.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
- Update the ready settings-return auto-run test to pass `providerReady: true`.
- Add assertions that missing/false `providerReady` returns `provider_not_ready`.
- Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure under the current helper.

### Task 2: Update Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
- Add `providerReady = false` parameter.
- After `providerBlocked`, return `provider_not_ready` when `providerReady` is false.
- Run focused Node test and confirm pass.

### Task 3: Wire Client Provider Ready

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
- Extend the typed decision wrapper with `providerReady`.
- Pass `providerGate.stage === "ready"` to the settings-return auto-run decision.
- Add `providerGate.stage` to effect dependencies.

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
1. Add failing provider-ready tests for settings-return auto-run.
2. Run focused Node test and confirm current helper failure.
3. Update `aiSettingsReturnAutoRunDecision()` to require `providerReady`.
4. Run focused Node test and confirm pass.
5. Pass provider ready state from AI Money client.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Complete

# Task Progress

*   2026-06-03 12:52:39 +0800
    *   Step: 1. Add failing provider-ready tests for settings-return auto-run.
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` so the ready settings-return path must pass `providerReady: true`, and missing or false provider readiness returns `provider_not_ready`.
    *   Change Summary: Added RED coverage for provider readiness on settings-return auto-run.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:52:39 +0800
    *   Step: 2. Run focused Node test and confirm current helper failure.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Confirmed the new test failed because the helper returned `ready` instead of `provider_not_ready` when provider readiness was absent.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:52:39 +0800
    *   Step: 3. Update `aiSettingsReturnAutoRunDecision()` to require `providerReady`.
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` with a default `providerReady = false` parameter and a `provider_not_ready` guard after `providerBlocked`.
    *   Change Summary: The settings-return auto-run decision now requires confirmed AI provider readiness.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:52:39 +0800
    *   Step: 4. Run focused Node test and confirm pass.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Confirmed all 218 AI helper tests pass.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:52:39 +0800
    *   Step: 5. Pass provider ready state from AI Money client.
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` so the typed settings-return decision wrapper accepts `providerReady`, the effect passes `providerGate.stage === "ready"`, and the dependency list includes `providerGate.stage`.
    *   Change Summary: `/ai-money?intent=rerun_ai` now waits for explicit provider readiness before starting the automatic AI scan.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:52:39 +0800
    *   Step: 6. Run Node test, typecheck, lint, and `git diff --check`.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck` in `client/`, `yarn lint` in `client/`, and `git diff --check`.
    *   Change Summary: Node tests passed, typecheck passed, lint exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passed.
    *   Reason: Executing plan step 6
    *   Blockers: Browser runtime verification was not performed because no callable in-app browser automation tool was available in this session.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The implementation only changes the settings-return auto-run path. Manual AI analysis and existing unknown-provider handling remain unchanged, while the explicit return from AI settings now requires `providerGate.stage === "ready"` before triggering `onDailyRadarScan()`.

No unreported deviations were detected. The only residual risk is runtime browser behavior, which was not inspected with browser automation in this session.
