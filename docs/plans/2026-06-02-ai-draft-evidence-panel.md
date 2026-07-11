# AI Draft Evidence Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show per-strategy AI evidence summaries so each AI draft exposes market context, sentiment/human risks, execution gates, and risk caps before the user acts on it.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that derives evidence rows for a single draft from the full AI analysis. The `/ai-money` client renders that helper output inside each strategy draft block.

**Tech Stack:** Next.js client components, JavaScript helper tests with Node test runner, TypeScript type casts in the existing client file.

### Task 1: RED tests for draft evidence

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1:** Import `aiDraftEvidenceFromAnalysis`.

**Step 2:** Add a test proving the helper returns evidence for market context, sentiment/human risk, execution gates, and risk caps.

**Step 3:** Add a test proving watch-only drafts are marked as observation-only and not backtest-ready.

**Step 4:** Run `node --test client/data/ai-goal-preset.test.mjs` and confirm the tests fail because the helper is missing.

### Task 2: Minimal helper implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1:** Export `aiDraftEvidenceFromAnalysis(analysis, draft)`.

**Step 2:** Include stable fields: `title`, `summary`, `tone`, `metrics`, `evidence`, `risks`, `gates`, and `actions`.

**Step 3:** Use existing helpers where possible: `backtestRequestFromDraft`, `normalizeRiskCaps`, `safeStringList`, and context counts.

### Task 3: Render evidence in strategy drafts

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Import `aiDraftEvidenceFromAnalysis`.

**Step 2:** Add a local type for the helper result.

**Step 3:** Pass `analysis` into `DraftBlock` and render the evidence summary beneath draft parameters.

### Task 4: Verification

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Run `node --test client/data/ai-goal-preset.test.mjs`.

**Step 2:** Run `yarn typecheck`.

**Step 3:** Run `git diff --check`.

Implementation Checklist:
1. Add failing tests for draft evidence.
2. Run Node tests and verify RED.
3. Implement the pure evidence helper.
4. Render the helper output in each AI draft card.
5. Run Node tests, TypeScript check, and diff whitespace check.

## Task Progress

* 2026-06-02 22:08:05 CST
  * Step: 1-2. Add failing tests for draft evidence and verify RED.
  * Modifications: Added `aiDraftEvidenceFromAnalysis` import and two behavior tests in `client/data/ai-goal-preset.test.mjs`.
  * Change Summary: The first test run failed because `aiDraftEvidenceFromAnalysis` was not exported, proving the missing behavior.
  * Reason: Executing plan steps 1-2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-02 22:08:05 CST
  * Step: 3-4. Implement the pure helper and render it in each draft card.
  * Modifications: Updated `client/data/ai-goal-preset.mjs` and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: Each AI strategy draft now shows market/context evidence, human/sentiment risks, execution gates, suggested actions, and risk cap summary.
  * Reason: Executing plan steps 3-4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-02 22:08:05 CST
  * Step: 5. Run verification.
  * Modifications: No code changes.
  * Change Summary: Node helper tests, TypeScript check, diff whitespace check, and unauthenticated `/ai-money` browser smoke passed.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. No unreported deviations were found. The browser smoke verified the known unauthenticated route behavior; the evidence panel itself remains covered by helper tests and TypeScript compilation because authenticated fixture data is not available in the current browser session.
