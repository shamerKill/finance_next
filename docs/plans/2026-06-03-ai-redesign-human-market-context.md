# AI Redesign Human Market Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When weak validation forces AI to redesign a strategy, carry concrete human-bias and market-signal context into the next AI goal.

**Architecture:** Keep the redesign path inside `client/data/ai-goal-preset.mjs`. `redesignFormStateFromWeakValidation()` already builds the proposed form state used by AI Daily Mission and AI Now Action, so enriching that helper will make the existing buttons submit better redesign prompts without UI wiring changes.

**Tech Stack:** Next.js helper module, Node built-in test runner, plain JavaScript tests.

### Task 1: Add the Regression Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Extend weak-validation redesign coverage so the analysis includes:
- `humanFactors: ["避免 FOMO 追涨"]`
- `watchSignals` containing a concrete market / narrative signal and action

Assert that the generated `proposedFormState.goal` includes:
- the concrete human factor
- the concrete watch signal
- the watch action
- the weak backtest evidence already present

**Step 2: Run focused tests to verify failure**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "weak validation"
```

Expected: FAIL because current redesign goal only mentions generic market wind / human bias wording.

### Task 2: Enrich AI Redesign Goal Context

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add concise evidence formatting**

Inside `redesignFormStateFromWeakValidation()`, derive short lists from:
- `analysis.humanFactors`
- `analysis.watchSignals` via existing `watchSignalReviewText()`

Limit each to a small count so the goal stays readable.

**Step 2: Inject the evidence into the goal**

Append concrete human and market signal evidence to the redesign goal before the safety instructions.

**Step 3: Keep fallback behavior**

If there are no human factors or watch signals, keep the existing generic goal text unchanged except for necessary spacing.

### Task 3: Verify

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/data/ai-settings-workflow.test.mjs`

**Step 1: Run focused tests**

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "weak validation"
```

Expected: PASS.

**Step 2: Run full helper tests**

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
```

Expected: PASS.

**Step 3: Run whitespace verification**

```bash
git diff --check
```

Expected: no whitespace errors.

Implementation Checklist:
1. Add failing weak-validation redesign context assertions.
2. Run focused tests and confirm they fail for missing concrete human / market context.
3. Enrich `redesignFormStateFromWeakValidation()` with human factors and watch signals.
4. Run focused tests.
5. Run full helper tests.
6. Run `git diff --check`.
7. Record task progress and final review in this plan file.

# Task Progress

*   2026-06-03 00:00 CST
    *   Step: 1. Add failing weak-validation redesign context assertions.
    *   Modifications: Extended `client/data/ai-goal-preset.test.mjs` weak-validation redesign coverage with concrete human factor and watch signal expectations.
    *   Change Summary: The test now requires redesign prompts to include exact FOMO and market-flow context.
    *   Reason: Executing plan step 1.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 2. Run focused tests and confirm they fail for missing concrete human / market context.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "weak validation"`.
    *   Change Summary: The focused test failed because the redesign goal did not include `避免 FOMO 追涨`.
    *   Reason: Executing plan step 2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 3. Enrich `redesignFormStateFromWeakValidation()` with human factors and watch signals.
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` to append concrete `humanFactors` and formatted `watchSignals` into the weak-validation redesign goal.
    *   Change Summary: AI redesign prompts now carry the actual FOMO / market-signal evidence from the prior run.
    *   Reason: Executing plan step 3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 00:00 CST
    *   Step: 4-6. Run focused tests, full helper tests, and whitespace verification.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "weak validation"`, `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`, and `git diff --check`.
    *   Change Summary: Focused tests passed; 197 helper tests passed; whitespace check passed.
    *   Reason: Executing plan steps 4, 5, and 6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan. Weak-validation redesign now preserves concrete failed-backtest evidence, human-bias evidence, and market / narrative watch signals in the next AI goal. No UI rewiring was required because existing AI Daily Mission and AI Now Action buttons already submit the enriched `proposedFormState`. No unreported deviations were found.
