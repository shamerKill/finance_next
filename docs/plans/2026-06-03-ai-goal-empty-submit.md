# AI Goal Empty Submit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Money primary submit flow accept an empty money goal so AI can auto-complete the goal and start safe analysis/validation.

**Architecture:** Extend the existing `aiGoalFormPrimaryActions()` metadata with `goalRequired: false`. The AI Money client will use that metadata for both the visual required marker and the HeroUI textarea validation flag.

**Tech Stack:** Next.js client component, existing AI Money pure helper module, Node test runner.

### Task 1: RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Update `aiGoalFormPrimaryActions makes analyze and validate the default submit path` to assert:

```js
assert.equal(actions.goalRequired, false);
assert.ok(actions.helperText.includes("目标可留空"));
```

**Step 2: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "aiGoalFormPrimaryActions"
```

Expected: FAIL because `goalRequired` is missing and helper text does not mention empty-goal support.

### Task 2: Helper Implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

Add `goalRequired: false` to `aiGoalFormPrimaryActions()` and update helper text to say the goal can be empty because AI will auto-complete it before validation.

### Task 3: UI Wiring

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

Extend the local `formActions` type with `goalRequired: boolean`.

Change:
- `<FormField label="赚钱目标" required>`
- `<Textarea ... isRequired />`

to use `formActions.goalRequired`.

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
1. Update `aiGoalFormPrimaryActions` test and verify RED.
2. Add `goalRequired: false` and helper text.
3. Wire `formActions.goalRequired` into `FormField` and `Textarea`.
4. Run full verification.

## Task Progress

* 2026-06-03 11:22:34 CST
  * Step: 1-3. Make the AI Money goal field non-blocking for auto-completion.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: The form action metadata now declares the money goal as not manually required; the goal textarea no longer blocks submit when empty, allowing the existing AI autocomplete flow to create a safe paper-mode goal.
  * Reason: Executing plan steps 1-3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

* 2026-06-03 11:23:25 CST
  * Step: 4. Run full verification.
  * Modifications: Ran the full AI helper test set, frontend typecheck, frontend lint, and diff whitespace check.
  * Change Summary: Verification passed; lint keeps the known unrelated `client/data/use-activity-center.tsx:138` warning.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. The AI Money goal textarea now follows `aiGoalFormPrimaryActions().goalRequired`, so an empty goal is not blocked by browser validation and can be handled by the existing AI autocomplete + paper-safe validation flow. No trading, testnet, or mainnet gate was relaxed.

Verification passed:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

`yarn lint` exits 0 with the existing warning in `client/data/use-activity-center.tsx:138`.
