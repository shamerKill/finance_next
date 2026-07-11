# AI Paper Primary CTA Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the main AI Money paper-candidate entry points consistently save the AI strategy draft before creating the paper observation handoff.

**Architecture:** Add a shared pure helper in `ai-goal-preset.mjs` that returns `save_and_accept_paper_candidate` when the selected paper candidate has not yet been saved as a strategy, and `accept_paper_candidate` once the strategy action is already `done`. Apply that helper to the first-line decision surfaces that users are most likely to click.

**Tech Stack:** Next.js client component, existing AI Money pure helper module, Node test runner.

### Task 1: State Helper Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing tests**

Update existing tests so these unsaved paper-candidate surfaces expect `save_and_accept_paper_candidate`:

- `aiCommandCenterFromState promotes a safe validated paper candidate`
- `aiDailyMissionFromState makes paper adoption the primary mission after strong validation`
- `aiNowActionFromState makes strong validation a single paper adoption task`
- `aiPaperReviewCoachFromState exposes a direct paper adoption action for ready candidates`
- `paperReviewCoachPrimaryAction maps ready paper review to adoption when a candidate is available`

**Step 2: Run test to verify failure**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because the old action kind is still `accept_paper_candidate`.

**Step 3: Implement helper**

Add `paperCandidatePrimaryActionFromActions(persistedActions, label)` near the action helpers. It returns:

- `{ kind: "save_and_accept_paper_candidate", label: "保存并采用 paper" }` when no `strategy` action has `status: "done"`.
- `{ kind: "accept_paper_candidate", label }` when the strategy is already saved.

Apply it to the four state surfaces above.

### Task 2: UI Handler Coverage

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Pass the combined handler**

Pass `saveAndAcceptPaperCandidate` to `AINowActionPanel`, `AICommandCenterPanel`, `AIDailyMissionPanel`, and `AIPaperReviewCoachPanel`.

**Step 2: Add button branches**

In each panel, when the primary command kind is `save_and_accept_paper_candidate`, call `onSaveAndAcceptPaperCandidate(candidate)`.

### Task 3: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: all pass; the known `use-activity-center.tsx:138` lint warning may remain.

Implementation Checklist:
1. Update tests for the four first-line paper candidate surfaces.
2. Verify tests fail for the old action kind.
3. Add the shared helper and update pure state surfaces.
4. Wire the four React panels to the combined handler.
5. Run full verification.

## Task Progress

* 2026-06-03 11:11:46 CST
  * Step: 1-5. Unify first-line paper candidate CTAs.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, and `client/app/(dashboard)/ai-money/client.tsx`; added state coverage for `save_and_accept_paper_candidate`; routed Now Action, Command Center, Daily Mission, and Paper Review Coach to `saveAndAcceptPaperCandidate`.
  * Change Summary: Unsaved paper candidates now save the AI strategy draft before creating the paper observation handoff on the main decision surfaces.
  * Reason: Executing plan steps 1-5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. The only minor correction was adding `strategySaveBusyKey !== null` to the four target panels' `isWorking` inputs so the combined save-and-adopt action cannot be double-clicked while saving. Verification passed with `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`; lint still reports the pre-existing warning in `client/data/use-activity-center.tsx:138`.
