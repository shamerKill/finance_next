# AI Money Paper Review Adopt Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI paper review helper execute the paper adoption action directly when a validated candidate is ready.

**Architecture:** Keep the existing AI state helper as the source of truth. Add a focused helper test proving `aiPaperReviewCoachFromState` exposes an `accept_paper_candidate` action for ready candidates, then wire the `AIPaperReviewCoachPanel` to render that action as a real button.

**Tech Stack:** Next.js client component, HeroUI buttons, Node test runner, TypeScript.

### Task 1: RED test for paper review ready action

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test that builds a strong validated paper candidate with no persisted `paper_watch`. Assert the paper review coach returns:
- `stage === "ready_to_adopt"`
- `primaryAction.kind === "accept_paper_candidate"`
- summary/next actions mention paper adoption and observation

**Step 2: Run focused test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper review|PaperReviewCoach'`

Expected: If the behavior already exists, the helper contract is confirmed and the UI is the only missing link. If it fails, update the helper before touching UI.

### Task 2: Add a tested action mapper and wire it into UI

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Add action mapper**

Export `paperReviewCoachPrimaryAction(state, { hasCandidate })`. It returns the direct `accept_paper_candidate` action only when a candidate exists; otherwise it falls back to a safe open-link action when `primaryHref` exists.

**Step 2: Extend component props**

Update `AIPaperReviewCoachPanel` to receive:
- `candidate: PaperCandidate | null`
- `isWorking: boolean`
- `onAcceptPaperCandidate: (candidate: PaperCandidate) => void`

**Step 3: Render accept button**

When `state.primaryAction.kind === "accept_paper_candidate"` and `candidate` exists, render a primary HeroUI `Button` that calls `onAcceptPaperCandidate(candidate)`. Keep the existing `open_link` and fallback link behavior.

**Step 4: Pass props from `AIGoalClient`**

Update the panel invocation to pass `capitalSizedCandidate`, current busy state, and `acceptPaperCandidate`.

### Task 3: Verification

**Files:**
- Review: `client/app/(dashboard)/ai-money/client.tsx`
- Review: `client/data/ai-goal-preset.test.mjs`

**Step 1: Run focused helper tests**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper review|PaperReviewCoach'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `use-activity-center.tsx` warning.

Implementation Checklist:
1. Add paper review ready-action test.
2. Run focused test and record the result.
3. Add RED test for `paperReviewCoachPrimaryAction`.
4. Run focused test and confirm expected missing-export failure.
5. Add `paperReviewCoachPrimaryAction`.
6. Add review panel props.
7. Render direct paper adoption button in the panel.
8. Pass candidate, busy state, and adoption handler from the AI Money page.
9. Run focused and full verification.
10. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "1. Add paper review ready-action test."

# Task Progress

*   2026-06-03T08:00:00+08:00
    *   Step: 1. Add paper review ready-action test.
    *   Modifications: Added a helper contract test proving `aiPaperReviewCoachFromState` exposes `accept_paper_candidate` for a strong candidate with no existing `paper_watch`.
    *   Change Summary: The helper already produced the right AI action, confirming the gap is in the UI action mapping.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 2. Run focused test and record the result.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper review|PaperReviewCoach'`.
    *   Change Summary: The helper contract passed immediately, so a separate UI action mapper RED test was needed.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 3-4. Add RED test for `paperReviewCoachPrimaryAction` and confirm expected missing-export failure.
    *   Modifications: Added `paperReviewCoachPrimaryAction` import and behavior test in `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: RED confirmed with missing export error for `paperReviewCoachPrimaryAction`.
    *   Reason: Executing plan steps 3 and 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 5. Add `paperReviewCoachPrimaryAction`.
    *   Modifications: Added `paperReviewCoachPrimaryAction` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: The paper review coach now has a tested primary-action mapper that returns direct paper adoption only when a candidate is available, otherwise falls back to a safe observation link.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 6-8. Add review panel props, render direct paper adoption button, and pass candidate/busy/handler from the AI Money page.
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` to import the mapper, pass `capitalSizedCandidate` and `acceptPaperCandidate`, and render a HeroUI button for `accept_paper_candidate`.
    *   Change Summary: The AI paper review helper can now directly execute the adoption handoff instead of only linking to the backtest.
    *   Reason: Executing plan steps 6 through 8
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 9. Run focused and full verification.
    *   Modifications: Ran focused helper tests, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and trailing-whitespace scan.
    *   Change Summary: Focused tests passed; full helper suite passed with 178 tests; typecheck passed; lint exited 0 with the existing unrelated `use-activity-center.tsx` warning; diff check and whitespace scan were clean.
    *   Reason: Executing plan step 9
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The implementation keeps the helper state as the source of truth and only adds a small tested mapper for UI action selection. The paper review panel now renders the AI-specified `accept_paper_candidate` action as a real button when a candidate exists; if no candidate is available, it falls back to the safe observation link.

Verification evidence:
- `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paperReviewCoachPrimaryAction|PaperReviewCoach'`: pass.
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 178 pass, 0 fail.
- `yarn typecheck`: exit 0.
- `yarn lint`: exit 0 with one existing unrelated warning in `client/data/use-activity-center.tsx`.
- `git diff --check`: exit 0.
- `rg -n "[[:blank:]]$" ...`: no matches.
