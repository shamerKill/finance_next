# AI Option Save Run Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an AI strategy draft is saved from `/option`, persist the handoff back into the source AI goal run so AI Money can advance to the next task.

**Architecture:** Add a small pure helper in `client/data/ai-goal-preset.mjs` that converts a parsed AI option preset plus create response into a strategy action patch. Reuse that helper from `client/app/(dashboard)/option/page.tsx` after successful option creation and before redirecting to the strategy detail page with the source `aiRunId`.

**Tech Stack:** Next.js client component, existing REST API client, Node test runner for `ai-goal-preset.mjs` helpers, TypeScript typecheck and ESLint.

### Task 1: Cover option-preset handoff with a failing test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1:** Import `strategyActionPatchFromOptionPresetCreate` from `client/data/ai-goal-preset.mjs`.

**Step 2:** Add a test that passes an AI preset-shaped object with `aiRunId`, `name`, `kind`, and `execSymbol`, plus a create response and href.

**Step 3:** Assert the helper returns `{ runId, actionId: "strategy", patch }`, with `patch.status === "done"`, `patch.relatedId`, `patch.href`, and a note mentioning the saved strategy and market context.

**Step 4:** Run `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'option preset create'`.

**Expected RED:** The test fails because `strategyActionPatchFromOptionPresetCreate` is not exported yet.

### Task 2: Implement the pure helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1:** Add `strategyActionPatchFromOptionPresetCreate({ preset, response, href })`.

**Step 2:** Return `null` unless `preset.isPreset` and `preset.aiRunId` are present.

**Step 3:** Reuse `strategyActionPatchFromSavedDraft` with normalized option preset data so note formatting remains consistent with AI Money internal saves.

**Step 4:** Run the focused Node test again.

**Expected GREEN:** The new test passes.

### Task 3: Wire `/option` save into AI run memory

**Files:**
- Modify: `client/app/(dashboard)/option/page.tsx`

**Step 1:** Import `updateAIGoalRunAction` and `strategyActionPatchFromOptionPresetCreate`.

**Step 2:** Pass `aiPreset.aiRunId` into `optionCreateRedirectHref`.

**Step 3:** After `createOption(payload)` succeeds, build the handoff helper result.

**Step 4:** If a handoff exists, call `updateAIGoalRunAction(handoff.runId, handoff.actionId, handoff.patch)` before `router.push(href)`.

**Step 5:** Keep the update scoped to AI presets; manual strategy creation keeps the existing `/strategies` redirect.

### Task 4: Verify

**Files:**
- Test commands only

**Step 1:** Run `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'option preset create|optionCreateRedirectHref|strategyActionPatchFromSavedDraft'`.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run `yarn typecheck` in `client/`.

**Step 4:** Run `yarn lint` in `client/`.

**Step 5:** Run `git diff --check`.

### Task 5: Review

**Files:**
- Modify: `docs/plans/2026-06-03-ai-option-save-run-memory.md`

**Step 1:** Append task progress after each completed task.

**Step 2:** Add final review confirming the implementation matches this plan or naming any deviations.

Implementation Checklist:
1. Add the failing option-preset handoff test.
2. Run the focused test and confirm RED.
3. Implement `strategyActionPatchFromOptionPresetCreate`.
4. Run the focused test and confirm GREEN.
5. Import the helper and `updateAIGoalRunAction` in `/option`.
6. Pass `aiPreset.aiRunId` into the strategy detail redirect.
7. Patch the source AI run `strategy` action after successful option creation.
8. Run focused helper tests.
9. Run related helper tests.
10. Run `yarn typecheck`.
11. Run `yarn lint`.
12. Run `git diff --check`.
13. Update task progress and final review.

# Task Progress

*   2026-06-03 09:00:17 CST
    *   Step: 1-2. Add the failing option-preset handoff test and confirm RED
    *   Modifications: Added `strategyActionPatchFromOptionPresetCreate` import and behavior test in `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: The test asserts that an AI `/option` preset create result becomes a completed `strategy` run action with href, related id, and market-context note.
    *   Reason: Executing plan steps 1-2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:00:17 CST
    *   Step: 3-4. Implement the pure helper and confirm GREEN
    *   Modifications: Added `strategyActionPatchFromOptionPresetCreate` in `client/data/ai-goal-preset.mjs`, reusing `strategyActionPatchFromSavedDraft`.
    *   Change Summary: AI option presets now produce a reusable `{ runId, actionId, patch }` handoff for saved strategy memory.
    *   Reason: Executing plan steps 3-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:00:17 CST
    *   Step: 5-7. Wire `/option` save into AI run memory
    *   Modifications: Updated `client/app/(dashboard)/option/page.tsx` to pass `aiPreset.aiRunId` into `optionCreateRedirectHref`, build the handoff, and call `updateAIGoalRunAction` after successful option creation.
    *   Change Summary: Saving an AI draft from `/option` now preserves the source run in the destination href and marks the source run `strategy` action as done when the handoff update succeeds.
    *   Reason: Executing plan steps 5-7
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:00:17 CST
    *   Step: 8-12. Verify
    *   Modifications: Ran focused and related tests plus TypeScript, ESLint, and diff checks.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'option preset create|optionCreateRedirectHref|strategyActionPatchFromSavedDraft'` passed; `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` passed 184/184; `yarn typecheck` passed; `yarn lint` passed with the existing `client/data/use-activity-center.tsx:138` unused eslint-disable warning; `git diff --check` passed.
    *   Reason: Executing plan steps 8-12
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation matches the final plan with one reported minor correction: AI run action sync failures are non-blocking after a strategy has already been created, so `/option` still redirects to the created strategy detail page and logs a Chinese warning. This avoids encouraging duplicate strategy creation while preserving the happy-path AI memory update. No unreported deviations were found.
