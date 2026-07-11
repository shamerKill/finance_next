# AI Analyze Entry Autocomplete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every AI Money "analyze and validate" entry that does not pass an explicit target form state use the AI-enriched executable goal instead of the raw current form.

**Architecture:** Add a small pure helper in `client/data/ai-goal-preset.mjs` to select the target form state for analysis. The helper keeps explicit panel-provided targets unchanged, but falls back to `aiGoalExecutableFormStateFromState()` when a button calls the analyze handler without a target.

**Tech Stack:** Next.js client component, React state callbacks, TypeScript, Node test runner for `.mjs` helper tests.

# Context
Filename: 2026-06-03-ai-analyze-entry-autocomplete.md
Created On: 2026-06-03 11:37:09 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The main AI Money form submit already uses `executableFormState()` so an empty or vague goal is automatically completed before analysis. Several panel buttons call `onAnalyzeAndValidate()` without an explicit form state, and that handler currently uses `currentFormState()` directly. This means some "start AI" buttons can bypass the automatic goal enrichment path.

# Project Overview
`finance_next` is a monorepo with a Next.js client and Go gateway. This task is limited to the AI Money frontend and the pure goal helper/test file.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
Relevant files:

`client/app/(dashboard)/ai-money/client.tsx` defines `onAnalyzeAndValidate(targetFormState?)`. When called with no target, it currently uses `currentFormState()` directly. No-argument callers include panels such as Opportunity Radar and Command Center, which should behave like the main submit path when the user leaves the goal blank.

`client/data/ai-goal-preset.mjs` already contains `aiGoalExecutableFormStateFromState()`, which produces an AI-enriched safe form state. A tiny selector helper can reuse that logic and keep the React handler easy to read.

`client/data/ai-goal-preset.test.mjs` already tests goal composer and executable form state behavior. The new selector helper should be tested there first.

# Proposed Solution
Add `aiGoalAnalyzeTargetFormState({ state, target, runs, now })`. If `target` is provided, return it unchanged so explicit panel actions keep their intended generated form state. If `target` is absent, return `aiGoalExecutableFormStateFromState({ state, runs, now })` so every no-argument "analyze and validate" button can safely auto-complete vague or blank goals before hitting the API.

Alternative approaches considered:

Changing every component to pass `executableFormState()` would work but is repetitive and easy to miss as new panels are added.

Changing `aiGoalRequestFromFormState()` to always enrich blank goals would be broader than needed and could surprise backend/API call sites that expect it to be a direct DTO mapper.

# Implementation Plan

### Task 1: Add RED Test For Analyze Target Selection

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Import `aiGoalAnalyzeTargetFormState` and add tests near `aiGoalExecutableFormStateFromState`:

```js
test("aiGoalAnalyzeTargetFormState enriches the current form when no explicit target is passed", () => {
  const next = aiGoalAnalyzeTargetFormState({
    state: {
      goal: "",
      symbolsText: "",
      horizon: "",
      riskPreference: "aggressive",
      executionMode: "mainnet",
      behaviorText: "",
      narrativeText: "",
      avoidText: "",
    },
    runs: [{ symbols: ["SOL"] }],
    now: new Date("2026-06-03T00:00:00.000Z"),
  });

  assert.ok(next.goal.includes("AI 自动补全赚钱目标"));
  assert.equal(next.symbolsText, "SOL");
  assert.equal(next.horizon, "24h-7d");
  assert.equal(next.riskPreference, "balanced");
  assert.equal(next.executionMode, "paper");
});

test("aiGoalAnalyzeTargetFormState preserves explicit panel targets", () => {
  const target = {
    goal: "复核 BTC 新闻风向后生成 paper 草案",
    symbolsText: "BTC",
    horizon: "3-10 days",
    riskPreference: "conservative",
    executionMode: "observe",
    behaviorText: "避免 FOMO",
    narrativeText: "ETF 资金流",
    avoidText: "主网下单",
  };

  assert.equal(
    aiGoalAnalyzeTargetFormState({
      state: { goal: "" },
      target,
      runs: [{ symbols: ["ETH"] }],
    }),
    target,
  );
});
```

**Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiGoalAnalyzeTargetFormState` is not exported.

### Task 2: Implement Pure Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add the helper after `aiGoalExecutableFormStateFromState()`**

```js
export function aiGoalAnalyzeTargetFormState({
  state = {},
  target,
  runs = [],
  now = new Date(),
} = {}) {
  if (target) return target;
  return aiGoalExecutableFormStateFromState({ state, runs, now });
}
```

**Step 2: Run the focused test to verify it passes**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Wire Into AI Money Page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Add `aiGoalAnalyzeTargetFormState` to imports and define:

```ts
const buildAnalyzeTargetFormState = aiGoalAnalyzeTargetFormState as unknown as (input: {
  state: AIGoalFormState;
  target?: AIGoalFormState;
  runs: TypeAIGoalRun[];
}) => AIGoalFormState;
```

**Step 2: Update `onAnalyzeAndValidate()`**

Replace:

```ts
const next = targetFormState ?? currentFormState();
```

with:

```ts
const next = buildAnalyzeTargetFormState({
  state: currentFormState(),
  target: targetFormState,
  runs,
});
```

Keep the existing `if (targetFormState) applyFormState(next);` so explicit panel states still update the form. For no-argument calls, no extra form write is required before analysis because the payload uses `next`.

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
```

Expected: PASS.

Run:

```bash
cd client && yarn typecheck
```

Expected: PASS.

Run:

```bash
cd client && yarn lint
```

Expected: exit 0. Existing warning in `client/data/use-activity-center.tsx:138` may remain.

Run:

```bash
git diff --check
```

Expected: PASS.

Implementation Checklist:
1. Add failing tests for `aiGoalAnalyzeTargetFormState` in `client/data/ai-goal-preset.test.mjs`.
2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure from the missing export.
3. Implement `aiGoalAnalyzeTargetFormState()` in `client/data/ai-goal-preset.mjs`.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm it passes.
5. Import and type `aiGoalAnalyzeTargetFormState` in `client/app/(dashboard)/ai-money/client.tsx`.
6. Update `onAnalyzeAndValidate()` to use the helper when no explicit target is passed.
7. Run node tests, typecheck, lint, and `git diff --check`.
8. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 11:37:09 +0800
    *   Step: 1. Add failing tests for `aiGoalAnalyzeTargetFormState` in `client/data/ai-goal-preset.test.mjs`; 2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm failure from the missing export.
    *   Modifications: Added import and two behavior tests for no-target enrichment and explicit target preservation.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './ai-goal-preset.mjs' does not provide an export named 'aiGoalAnalyzeTargetFormState'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:37:09 +0800
    *   Step: 3. Implement `aiGoalAnalyzeTargetFormState()` in `client/data/ai-goal-preset.mjs`; 4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm it passes.
    *   Modifications: Added `aiGoalAnalyzeTargetFormState()` after `aiGoalExecutableFormStateFromState()`.
    *   Change Summary: GREEN confirmed with 207 passing `ai-goal-preset` tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:37:09 +0800
    *   Step: 5. Import and type `aiGoalAnalyzeTargetFormState` in `client/app/(dashboard)/ai-money/client.tsx`; 6. Update `onAnalyzeAndValidate()` to use the helper when no explicit target is passed.
    *   Modifications: Imported `aiGoalAnalyzeTargetFormState`, added `buildAnalyzeTargetFormState`, and changed `onAnalyzeAndValidate()` so no-argument analysis uses the AI-enriched executable form state.
    *   Change Summary: No-argument AI analysis buttons now inherit the same target auto-completion as the main submit path.
    *   Reason: Executing plan steps 5-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:40:30 +0800
    *   Step: 7. Run node tests, typecheck, lint, and `git diff --check`; 8. Update Task Progress and Final Review in this document.
    *   Modifications: Ran the planned verification commands and updated this document.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` passed with 209 tests; `yarn typecheck` passed; `yarn lint` exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`; `git diff --check` passed.
    *   Reason: Executing plan steps 7-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan. No unreported deviations were found.

Security and safety review: the change only affects which safe form state is sent to AI analysis when a UI action has no explicit target. It preserves the existing observe/paper execution cap and does not add live trading or credential behavior.

Maintainability review: the fallback selection is centralized in a pure helper with tests, so future panels can call `onAnalyzeAndValidate()` without duplicating enrichment logic.
