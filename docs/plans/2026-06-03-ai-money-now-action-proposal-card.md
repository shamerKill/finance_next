# AI Money Now Action Proposal Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the AI-generated money goal directly inside the "AI 当前任务" panel so the user can see what AI will analyze before pressing the primary action.

**Architecture:** Add a small `proposalCard` view model to the existing `aiNowActionFromState` idle path, derived from `proposedFormState`. Render that card in `AINowActionPanel` without changing the existing `scan_today` execution route.

**Tech Stack:** ESM helper functions, Node test runner, Next.js React client component, HeroUI primitives already used in the page.

### Task 1: RED tests for now-action proposal card

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Update idle now-action test**

Add expectations that idle `aiNowActionFromState` returns `proposalCard` with:
- title `AI 自动目标草案`
- goal matching `proposedFormState.goal`
- stat labels for `标的`, `周期`, `执行`
- check text mentioning market direction, news sentiment, human bias, backtest, and paper

**Step 2: Update memory proposal test**

Add expectations that the memory-based proposal card uses deduped symbols and paper-only execution.

**Step 3: Run focused RED test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`

Expected: FAIL because `proposalCard` is currently missing.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Add proposal card helper**

Add a small internal helper in `client/data/ai-goal-preset.mjs` that turns a form state into:
- `title`
- `goal`
- `stats`
- `checks`

**Step 2: Attach proposal card to now action**

In the no-analysis branch of `aiNowActionFromState`, attach `proposalCard` whenever `task.proposedFormState` exists.

**Step 3: Render proposal card in UI**

Extend `AINowActionState` with optional `proposedFormState` and `proposalCard`, then render a compact bordered block under the current task guardrail. Use existing `Stat` styling and do not nest cards inside cards.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`
- Review: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Run focused GREEN test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning.

Implementation Checklist:
1. Update idle now-action test for `proposalCard`.
2. Update memory proposal test for `proposalCard`.
3. Run focused RED test and confirm failure.
4. Add proposal card helper.
5. Attach `proposalCard` to idle now action.
6. Render the card in `AINowActionPanel`.
7. Run focused and full verification.
8. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "Final review completed."

# Task Progress
*   [2026-06-03 08:26:39 CST]
    *   Step: 1-2. RED tests for now-action proposal card
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` so idle and memory-based AI now-action states must expose a `proposalCard` with goal text, stat labels, and safety checks.
    *   Change Summary: Added regression coverage for the view model needed to show the AI-generated target in the current task panel.
    *   Reason: Executing plan steps 1-2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:26:39 CST]
    *   Step: 3. Run focused RED test and confirm failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`; the focused tests failed because `proposalCard` was undefined.
    *   Change Summary: Confirmed the missing proposal-card behavior.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:28:26 CST]
    *   Step: 4. Add proposal card helper
    *   Modifications: Added `aiGoalProposalCardFromFormState` in `client/data/ai-goal-preset.mjs`, including title, goal, stat rows, and AI safety checks.
    *   Change Summary: The data layer now exposes a compact card model for the AI-generated target.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:28:26 CST]
    *   Step: 5. Attach `proposalCard` to idle now action
    *   Modifications: Updated the no-analysis branch of `aiNowActionFromState` to include `proposalCard` when `task.proposedFormState` is present.
    *   Change Summary: The current-task state now carries both the generated form state and its display model.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:28:26 CST]
    *   Step: 6. Render the card in `AINowActionPanel`
    *   Modifications: Extended `AINowActionState` in `client/app/(dashboard)/ai-money/client.tsx` with optional `proposedFormState` and `proposalCard`, then rendered a bordered proposal block with stat rows and safety checks under the current task guardrail.
    *   Change Summary: The AI Money first screen can show the generated target before the user presses the primary action.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:28:26 CST]
    *   Step: 7. Run focused and full verification
    *   Modifications: Ran focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan. Also attempted local browser verification by starting `yarn dev`.
    *   Change Summary: Focused tests passed; full helper test suite passed 181/181; typecheck passed; lint exited 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning; diff check passed; trailing-whitespace scan had no matches. Browser verification could not reach `/ai-money` because the dashboard layout requires a valid gateway-authenticated `/auth/me` session and redirected to `/login` in this local environment.
    *   Reason: Executing plan step 7
    *   Blockers: Browser rendering verification requires a running authenticated gateway session
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The implementation added the `proposalCard` data model, attached it to the idle `aiNowActionFromState` path, and rendered it inside `AINowActionPanel` without changing the existing `scan_today` execution route. No unreported deviations were found. Automated verification passed; browser verification was attempted but blocked by the local auth/gateway dependency, not by a compile or test failure.
