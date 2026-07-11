# AI Paper Save And Adopt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money paper adoption package perform the natural user action: save the AI strategy draft and create the paper observation handoff in one primary click.

**Architecture:** Keep the existing pure state helpers as the source of UI intent, but change only the package panel's primary action kind to a combined save-and-adopt command. In the React client, reuse the existing save strategy and paper watch update logic through a small core helper so the standalone save button keeps its current redirect behavior while the combined primary action stays on the AI Money workbench.

**Tech Stack:** Next.js client component, React state handlers, existing AI Money helper module, Node test runner.

### Task 1: Express The Combined Primary Action

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Update the `aiPaperAdoptionPackageFromState packages a ready paper candidate` test so the package primary action is:

```js
{
  kind: "save_and_accept_paper_candidate",
  label: "保存并采用 paper",
}
```

Keep the secondary action as `save_strategy_draft`.

**Step 2: Run test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because the current primary action kind is `accept_paper_candidate`.

**Step 3: Write minimal implementation**

Update `aiPaperAdoptionPackageFromState()` so only the adoption package primary action uses `save_and_accept_paper_candidate`; all other paper candidate actions remain unchanged.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: pass.

### Task 2: Add Client-Side Save-And-Adopt Orchestration

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Refactor save logic**

Extract the common body of `saveStrategyDraft()` into a helper that returns the saved strategy href and accepts an option to redirect.

**Step 2: Add combined paper adoption handler**

Create `saveAndAcceptPaperCandidate(candidate)` that:

1. Builds a candidate whose strategy href points at the saved strategy when save succeeds.
2. Saves the candidate draft without redirecting.
3. Calls the existing paper candidate acceptance logic.
4. Keeps error and busy state behavior consistent with the standalone save path.

**Step 3: Wire the package panel**

Pass `saveAndAcceptPaperCandidate` into `AIPaperAdoptionPackagePanel`. In that panel, call the combined handler when `state.primaryAction.kind === "save_and_accept_paper_candidate"`; otherwise use the existing `onAcceptPaperCandidate` path.

### Task 3: Verify

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `client/data/ai-settings-workflow.test.mjs`

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: all pass, except the known existing lint warning in `client/data/use-activity-center.tsx` may remain.

Implementation Checklist:
1. Update the paper adoption package test to require the combined primary action.
2. Run the target test and confirm it fails for the current primary action.
3. Update `aiPaperAdoptionPackageFromState()` primary action.
4. Run the target test and confirm it passes.
5. Refactor `saveStrategyDraft()` into a reusable core save helper.
6. Add `saveAndAcceptPaperCandidate(candidate)`.
7. Wire `AIPaperAdoptionPackagePanel` to the combined handler.
8. Run full verification commands.
