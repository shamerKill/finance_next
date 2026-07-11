# AI Frontend Execution Context Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI money page use backend execution context for execution readiness while live account data is still loading or unavailable.

**Architecture:** `aiExecutionReadinessFromState()` remains the single frontend readiness helper. It should prefer loaded local account data when provided, and otherwise derive account, halt, and portfolio-limit gates from `analysis.context.execution`.

**Tech Stack:** Next.js client code, TypeScript type casts, Node test runner for `client/data/ai-goal-preset.test.mjs`.

### Task 1: RED tests for execution context readiness

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1:** Add tests proving backend execution context can supply account readiness when `accounts` is not loaded.

**Step 2:** Add tests proving `tradingHalted` blocks execution readiness.

**Step 3:** Add tests proving empty portfolio limits block execution readiness.

**Step 4:** Run `node --test client/data/ai-goal-preset.test.mjs` and confirm the new tests fail for the expected missing behavior.

### Task 2: Minimal implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Add a small normalizer for `analysis.context.execution`.

**Step 2:** In `aiExecutionReadinessFromState()`, treat missing `accounts` as “not loaded” and use the backend execution context snapshot.

**Step 3:** Add stage and blocker handling for global halt and missing portfolio limits.

**Step 4:** Update the AI money page type cast and call so accounts are only passed after the account request finishes.

### Task 3: Verification

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Run `node --test client/data/ai-goal-preset.test.mjs`.

**Step 2:** Run `yarn typecheck`.

**Step 3:** Run `git diff --check`.

Implementation Checklist:
1. Add failing frontend readiness tests.
2. Run the Node test and verify RED.
3. Implement execution context normalization and readiness gates.
4. Update AI money page accounts handoff while loading.
5. Run Node tests, TypeScript check, and diff whitespace check.

## Task Progress

* 2026-06-02 21:59:10 CST
  * Step: 1-2. Add failing frontend readiness tests and verify RED.
  * Modifications: Added three `aiExecutionReadinessFromState()` tests covering backend account context, trading halt, and unset portfolio limits.
  * Change Summary: The new tests failed with the previous `account_blocked` behavior, proving the missing execution context handling.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-02 21:59:10 CST
  * Step: 3-4. Implement execution context normalization and update page account handoff.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: Readiness now falls back to backend execution context before live accounts finish loading, and blocks on global halt or unset portfolio limits.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-02 21:59:10 CST
  * Step: 5. Run Node tests, TypeScript check, and diff whitespace check.
  * Modifications: No code changes.
  * Change Summary: Verification passed for the targeted frontend helper tests, TypeScript, and diff whitespace.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. No unreported deviations were found. The only reported minor correction was treating any missing or zero portfolio limit field as an unset portfolio limit, which matches the safety intent of the plan.
