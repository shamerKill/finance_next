# AI Autonomous Command Prefill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the top AI autonomous command card launch analysis with AI-generated goal form state, so idle users can start with one click instead of manually filling the form first.

**Architecture:** Reuse the `proposedFormState` and `scanFormState` already produced by `aiNowActionFromState`. Surface those fields from `aiAutonomousCommandFromState`, then pass them through the top card action handlers.

**Tech Stack:** Plain JavaScript helper, Next.js client component, Node test runner.

### Task 1: Data Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing test**

Extend the idle `aiAutonomousCommandFromState()` test to assert:
- `proposedFormState.goal` exists and contains AI auto goal language.
- `scanFormState.goal` matches `proposedFormState.goal`.
- `proposalCard.goal` matches `proposedFormState.goal`.

**Step 2: Run test**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiAutonomousCommandFromState()` does not expose those fields yet.

**Step 3: Implement field pass-through**

In `aiAutonomousCommandFromState()`, include:
- `proposedFormState: nowAction.proposedFormState`
- `scanFormState: nowAction.scanFormState`
- `proposalCard: nowAction.proposalCard`

**Step 4: Verify helper**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: UI Action Wiring

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend local state type**

Add optional `proposedFormState`, `scanFormState`, and `proposalCard` fields to `AIAutonomousCommandState`.

**Step 2: Pass target form state into actions**

In `AIAutonomousCommandPanel`, change `onAnalyzeAndValidate` and `onScan` prop types to accept optional `AIGoalFormState`. Pass `state.scanFormState ?? state.proposedFormState` when invoking analyze/scan.

**Step 3: Show the proposal card**

If `state.proposalCard` exists, render a compact "AI 自动目标草案" preview in the autonomous command card.

**Step 4: Verify**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

## Task Progress

* 2026-06-03 09:35:43 CST
  * Step: Task 1 and Task 2 complete
  * Modifications:
    * `client/data/ai-goal-preset.test.mjs`: extended the idle autonomous command test to require AI-generated proposed/scan form state and proposal card data.
    * `client/data/ai-goal-preset.mjs`: passed `proposedFormState`, `scanFormState`, and `proposalCard` through from `aiNowActionFromState()` into `aiAutonomousCommandFromState()`.
    * `client/app/(dashboard)/ai-money/client.tsx`: added autonomous command form-state typing, passed the AI-generated goal into scan/analyze actions, and rendered the proposal preview in the top card.
  * Change Summary: The top AI autonomous command can now start from AI-generated goal context with one click, instead of relying on manually filled form fields.
  * Reason: Executing the AI autonomous command prefill plan.
  * Blockers: None. `yarn lint` still reports the pre-existing unrelated unused eslint-disable warning in `client/data/use-activity-center.tsx:138`.
  * User Confirmation Status: Pending Confirmation

## Final Review

Implementation matches the plan. The RED test failed because `command.proposedFormState` was missing; after the minimal helper and UI wiring changes, the targeted helper tests, combined workflow tests, TypeScript check, lint, and diff whitespace check completed successfully. No unreported deviations were found.
