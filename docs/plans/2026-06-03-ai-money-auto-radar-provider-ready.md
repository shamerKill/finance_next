# AI Money Auto Radar Provider Ready Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure normal daily auto radar only starts when a real AI provider is confirmed ready, preventing silent fallback analysis from automatic behavior.

**Architecture:** Keep manual AI Money analysis behavior unchanged for provider unknown states. Add an explicit provider readiness gate to the pure `autoDailyRadarDecision()` helper, then pass `providerGate.stage === "ready"` from the AI Money client effect.

**Tech Stack:** Next.js client component, plain `.mjs` AI helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-auto-radar-provider-ready.md
Created On: 2026-06-03 12:54:56 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The settings-return auto re-run now requires provider readiness, but the normal daily auto radar still only checks `providerGate.blockAutoRadar`. Because unknown provider status is not blocked for manual continuity, normal auto radar can still run without confirmed provider readiness and produce fallback analysis.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches AI Money frontend auto-run behavior and helper tests.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`autoDailyRadarDecision()` currently receives `enabled`, `busy`, `status`, `lastKey`, and `now`.

The AI Money client calls it from the normal daily auto radar `useEffect()` after checking `providerGate.blockAutoRadar`. For unknown provider status, `blockAutoRadar` is false, so automatic scans are still allowed.

Manual analysis paths use `redirectIfProviderBlocksAnalysis()`, which blocks only explicit blocked provider states. This remains unchanged.

# Proposed Solution

Add `providerReady = false` to `autoDailyRadarDecision()`. The helper returns `reason: "provider_not_ready"` after `busy` and before freshness checks unless the caller passes `providerReady: true`.

Update the normal auto radar effect to pass `providerGate.stage === "ready"` into `autoDailyRadarDecision()` and include `providerGate.stage` in the dependency list.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
- Update the existing enabled auto radar test to pass `providerReady: true`.
- Add assertions proving missing or false `providerReady` returns `provider_not_ready`.
- Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure under current helper.

### Task 2: Update Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
- Add `providerReady = false` parameter to `autoDailyRadarDecision()`.
- Return `{ shouldRun: false, key: "", reason: "provider_not_ready" }` when provider is not ready.
- Run focused Node test and confirm pass.

### Task 3: Wire Client Provider Ready

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
- Extend the typed `decideAutoDailyRadar` wrapper with `providerReady`.
- Pass `providerGate.stage === "ready"` to the normal daily auto radar decision.
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
1. Add failing provider-ready tests for normal daily auto radar.
2. Run focused Node test and confirm current helper failure.
3. Update `autoDailyRadarDecision()` to require `providerReady`.
4. Run focused Node test and confirm pass.
5. Pass provider ready state from AI Money normal auto radar effect.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Complete

# Task Progress

*   2026-06-03 13:09:48 +0800
    *   Step: 1. Add failing provider-ready tests for normal daily auto radar.
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` so ready auto radar calls pass `providerReady: true`, and missing or false provider readiness returns `provider_not_ready`.
    *   Change Summary: Added RED coverage proving normal daily auto radar must wait for confirmed provider readiness.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:09:48 +0800
    *   Step: 2. Run focused Node test and confirm current helper failure.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Confirmed the new provider-ready assertion failed because the helper returned `ready` instead of `provider_not_ready`.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:09:48 +0800
    *   Step: 3. Update `autoDailyRadarDecision()` to require `providerReady`.
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` with a default `providerReady = false` parameter and an early `provider_not_ready` guard after disabled/busy checks.
    *   Change Summary: Normal daily auto radar now requires confirmed real AI provider readiness before it can start.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:09:48 +0800
    *   Step: 4. Run focused Node test and confirm pass.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Confirmed all 218 AI helper tests pass after the helper change.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:09:48 +0800
    *   Step: 5. Pass provider ready state from AI Money normal auto radar effect.
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` so `decideAutoDailyRadar` accepts `providerReady`, the normal auto radar effect passes `providerGate.stage === "ready"`, and the dependency list includes `providerGate.stage`.
    *   Change Summary: The UI's normal daily auto radar effect now matches the helper safety contract.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:09:48 +0800
    *   Step: 6. Run Node test, typecheck, lint, and `git diff --check`.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck` in `client/`, `yarn lint` in `client/`, and `git diff --check`.
    *   Change Summary: Node tests passed, typecheck passed, lint exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passed.
    *   Reason: Executing plan step 6
    *   Blockers: Browser runtime verification was not performed because no callable in-app browser automation tool was available in this session.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The implementation only tightens the normal daily auto radar path. Manual AI Money analysis remains governed by `redirectIfProviderBlocksAnalysis()`, so unknown provider status still preserves manual continuity while automatic scans wait for confirmed real AI readiness.

No unreported deviations were detected. The only residual risk is runtime browser behavior, which was not inspected with browser automation in this session.
