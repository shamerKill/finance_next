# AI Goal Submit Autocomplete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the main AI Money submit actions automatically use the AI-enriched goal state so a rough goal like "帮我赚钱" can immediately start safe analysis and validation.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that returns `aiGoalComposerFromFormState(...).proposedFormState`. Wire the AI Money page submit and analyze-only action to that helper so the UI applies the enriched state before sending the API request.

**Tech Stack:** Next.js client component, existing AI Money pure helper module, Node test runner.

### Task 1: RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test for `aiGoalExecutableFormStateFromState` proving that a vague goal plus recent run symbols becomes a complete paper-mode form state with symbols, horizon, default human constraints, default market narrative focus, and default avoid scenarios.

**Step 2: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "aiGoalExecutableFormStateFromState"
```

Expected: FAIL because the helper is not exported yet.

### Task 2: Helper Implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

Add:

```js
export function aiGoalExecutableFormStateFromState({ state = {}, runs = [], now = new Date() } = {}) {
  return aiGoalComposerFromFormState({ state, runs, now }).proposedFormState;
}
```

Then run the focused test and confirm GREEN.

### Task 3: UI Wiring

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

Import `aiGoalExecutableFormStateFromState`.

Use it for:
- `onSubmit`: compute executable state from `currentFormState()` and `runs`, then pass it to `onAnalyzeAndValidate(next)`.
- the "只生成蓝图" button: compute executable state, apply it to the form, then call `runGoalAnalysis(aiGoalRequestFromFormState(next))`.

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: all pass; the known `client/data/use-activity-center.tsx:138` lint warning may remain.

Implementation Checklist:
1. Add the failing executable form-state test.
2. Run the focused test and confirm RED.
3. Implement `aiGoalExecutableFormStateFromState`.
4. Run the focused test and confirm GREEN.
5. Wire submit and analyze-only actions to the helper.
6. Run full verification.

## Task Progress

* 2026-06-03 11:16:58 CST
  * Step: 1-5. Add executable goal-state helper and wire AI Money submit actions.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: Main submit and analyze-only actions now use the AI-enriched form state before calling the goal analysis API, so rough goals are automatically converted into paper-safe, market/human/sentiment-aware requests.
  * Reason: Executing plan steps 1-5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

* 2026-06-03 11:18:09 CST
  * Step: 6. Run full verification.
  * Modifications: Ran the full AI helper test set, frontend typecheck, frontend lint, and diff whitespace check.
  * Change Summary: Verification passed; lint keeps the known unrelated `client/data/use-activity-center.tsx:138` warning.
  * Reason: Executing plan step 6.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. `aiGoalExecutableFormStateFromState` reuses the existing composer rules, and the AI Money submit plus analyze-only paths now apply that enriched state before API calls. No execution gate, paper gate, testnet gate, or mainnet gate was relaxed.

Verification passed:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

`yarn lint` exits 0 with the existing warning in `client/data/use-activity-center.tsx:138`.
