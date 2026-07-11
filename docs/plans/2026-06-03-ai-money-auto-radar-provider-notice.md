# AI Money Auto Radar Provider Notice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money explain why automatic daily radar is waiting when the real AI provider is not ready.

**Architecture:** Add a small pure helper that converts `autoEnabled` plus provider gate state into a UI notice. The AI Money client computes that notice and renders it inside the existing "今日雷达" card, keeping manual analysis and auto-run logic unchanged.

**Tech Stack:** Next.js client component, plain `.mjs` AI helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-auto-radar-provider-notice.md
Created On: 2026-06-03 13:12:33 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Normal daily auto radar now requires `providerGate.stage === "ready"`, but the UI can look idle when auto radar is enabled and provider status is loading, unknown, or blocked. The user should see a concise reason and a direct AI settings link in the "今日雷达" card.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches AI Money frontend observability and helper tests.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`DailyRadarStatusCard` currently shows scan state, auto radar switch, and action buttons, but it does not receive provider readiness information.

`providerGate` already exposes `stage`, `blockAutoRadar`, `title`, `summary`, `primaryHref`, and `primaryAction`.

Automatic scans now wait for `providerGate.stage === "ready"`, so the UI should explain the waiting state near the auto radar toggle.

# Proposed Solution

Add `autoRadarProviderNoticeFromGate({ autoEnabled, gate })` to `client/data/ai-goal-preset.mjs`.

The helper returns `null` when auto radar is disabled or the provider stage is `ready`. Otherwise it returns a notice object with `tone`, `title`, `summary`, `primaryHref`, and `primaryAction`.

The AI Money client computes the notice and passes it to `DailyRadarStatusCard`, which renders a compact warning/info panel inside the "今日雷达" card.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
- Import `autoRadarProviderNoticeFromGate`.
- Add a test proving it returns a notice when `autoEnabled: true` and `gate.stage` is `loading`, `unknown`, or `blocked`.
- Add assertions that disabled auto radar and ready provider return `null`.
- Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure because the helper is missing.

### Task 2: Implement Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
- Export `autoRadarProviderNoticeFromGate({ autoEnabled = false, gate = null } = {})`.
- Return `null` when auto radar is disabled or `gate.stage === "ready"`.
- Build a concise notice from provider gate data for loading, unknown, and blocked states.
- Run focused Node test and confirm pass.

### Task 3: Render Notice in AI Money

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
- Import `autoRadarProviderNoticeFromGate`.
- Add a small `AutoRadarProviderNotice` type and typed wrapper.
- Compute `autoRadarProviderNotice` from `autoRadarEnabled` and `providerGate`.
- Pass it to `DailyRadarStatusCard`.
- Update `DailyRadarStatusCard` props and render a compact bordered notice with optional settings link.

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
1. Add failing auto radar provider notice tests.
2. Run focused Node test and confirm missing-helper failure.
3. Implement `autoRadarProviderNoticeFromGate()`.
4. Run focused Node test and confirm pass.
5. Wire and render the notice in `DailyRadarStatusCard`.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Complete

# Task Progress

*   2026-06-03 13:27:53 +0800
    *   Step: 1. Add failing auto radar provider notice tests.
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` to import `autoRadarProviderNoticeFromGate` and assert loading, unknown, blocked, ready, and disabled auto radar notice behavior.
    *   Change Summary: Added RED coverage for explaining why enabled auto radar is waiting for a real AI provider.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:27:53 +0800
    *   Step: 2. Run focused Node test and confirm missing-helper failure.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Confirmed RED failure because `client/data/ai-goal-preset.mjs` did not export `autoRadarProviderNoticeFromGate`.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:27:53 +0800
    *   Step: 3. Implement `autoRadarProviderNoticeFromGate()`.
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` with `autoRadarProviderNoticeFromGate({ autoEnabled, gate })`, returning `null` for disabled/ready states and a `waiting_provider` notice for loading, unknown, or blocked provider states.
    *   Change Summary: Auto radar can now explain that it is waiting for real AI readiness instead of silently appearing idle.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:27:53 +0800
    *   Step: 4. Run focused Node test and confirm pass.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: Confirmed all 219 AI helper tests pass after implementing the helper.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:27:53 +0800
    *   Step: 5. Wire and render the notice in `DailyRadarStatusCard`.
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` to import the helper, define `AutoRadarProviderNotice`, compute `autoRadarProviderNotice`, pass it into `DailyRadarStatusCard`, and render a compact provider notice with a settings link.
    *   Change Summary: The "今日雷达" card now tells users why automatic radar is waiting and gives a direct AI settings action.
    *   Reason: Executing plan step 5
    *   Blockers: A TypeScript check initially failed because `AutoRadarProviderNotice.tone` was typed as `string`; root cause was `StatusBadge` requiring `StatusTone`. The type was corrected to reuse `StatusTone`.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 13:27:53 +0800
    *   Step: 6. Run Node test, typecheck, lint, and `git diff --check`.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck` in `client/`, `yarn lint` in `client/`, and `git diff --check`.
    *   Change Summary: Node tests passed, typecheck passed after the tone type correction, lint exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passed.
    *   Reason: Executing plan step 6
    *   Blockers: Browser runtime verification was not performed because no callable in-app browser automation tool was available in this session.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The implementation only adds observability to the "今日雷达" card. It does not change manual analysis, provider redirect behavior, auto radar preference persistence, or the auto radar execution gate.

No unreported deviations were detected. The only residual risk is runtime browser behavior, which was not inspected with browser automation in this session.
