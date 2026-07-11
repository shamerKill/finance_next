# AI Goal Primary Validation Submit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money goal form default submit path analyze the goal and immediately start safe validation backtests, so the user can hand a money-making objective to AI with fewer manual steps.

**Architecture:** Keep the existing `analyzeAndValidateGoal` pipeline as the single full-action path. Add a small CTA helper in `client/data/ai-goal-preset.mjs` so tests can lock the primary/secondary action labels, then wire the form submit and visible buttons in `client/app/(dashboard)/ai-money/client.tsx` to the helper.

**Tech Stack:** Next.js client data helpers, React client component, Node test runner, TDD.

### Task 1: Add Failing CTA Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Add a test for `aiGoalFormPrimaryActions`.
2. Assert the primary action is `analyze_and_validate`, has label `分析并启动验证`, and is a submit action.
3. Assert the secondary action is `analyze_only` with label `只生成蓝图`.
4. Verify the test fails because the helper is not exported yet.

### Task 2: Implement Helper and UI Wiring

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Export `aiGoalFormPrimaryActions` with primary, secondary, and safety helper copy.
2. Move form submit to `onAnalyzeAndValidate`, which runs analysis and validation backtests.
3. Change the primary submit button to use the helper primary label.
4. Change the secondary flat button to run `runGoalAnalysis` only and use the helper secondary label.
5. Keep the existing daily radar scan button unchanged.

### Task 3: Verify

**Commands:**
- `node --test --test-name-pattern "aiGoalFormPrimaryActions" client/data/ai-goal-preset.test.mjs`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Expected:** Pressing Enter or the primary button now starts AI analysis plus validation backtests, while the secondary button still allows blueprint-only analysis without submitting orders.
