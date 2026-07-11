# AI Goal Request Execution Mode Cap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure every AI goal analysis request starts at observe/paper even when the form selected testnet or mainnet, so AI can analyze and validate goals without treating higher execution stages as default permission.

**Architecture:** Reuse the existing `safeExecutionModeForGoal` helper in `client/data/ai-goal-preset.mjs` at the request-construction boundary. This keeps template application, goal enrichment, and raw form submission aligned: AI may generate a path toward validation and paper review, but testnet/mainnet remain gated later by evidence and human confirmation.

**Tech Stack:** Next.js client data helpers, Node test runner, TDD.

### Task 1: Add Failing Request Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Add a test for `aiGoalRequestFromFormState` with `executionMode: "mainnet"`.
2. Add a test case with `executionMode: "testnet"`.
3. Assert both requests are capped to `paper`.
4. Assert `executionMode: "observe"` stays `observe`.
5. Verify the test fails because the request currently preserves `mainnet`.

### Task 2: Cap Request Execution Mode

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Replace raw execution mode trimming in `aiGoalRequestFromFormState` with `safeExecutionModeForGoal(state?.executionMode)`.
2. Keep symbols, horizon, risk preference, behavior constraints, market narrative focus, and avoid scenarios unchanged.
3. Align the vague-goal composer summary with the existing one-click enrichment + validation behavior.

### Task 3: Verify

**Commands:**
- `node --test --test-name-pattern "aiGoalRequestFromFormState caps unsafe execution modes" client/data/ai-goal-preset.test.mjs`
- `node --test --test-name-pattern "aiGoalComposerFromFormState enriches vague money goals safely" client/data/ai-goal-preset.test.mjs`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Expected:** Direct form submission, enriched-goal submission, and template submission all keep AI analysis requests at observe/paper while preserving the later gated path toward paper review and testnet readiness.
