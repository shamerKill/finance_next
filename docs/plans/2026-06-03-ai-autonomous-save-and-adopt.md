# AI Autonomous Save And Adopt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the top AI autonomous command use the same complete paper adoption path as the paper adoption package: save the AI strategy draft, then create the paper observation handoff.

**Architecture:** Keep the existing action-state helpers as the source of intent. Add a small autonomous-command normalization that upgrades an unsaved `accept_paper_candidate` command to `save_and_accept_paper_candidate`, while keeping already saved strategies on the direct paper observation action.

**Tech Stack:** Next.js client component, React callbacks, existing AI Money pure helpers, Node test runner.

### Task 1: Autonomous Command Intent

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Add a test for `aiAutonomousCommandFromState` where:

- `analysis` has one grid DCA strategy draft.
- `validationRuns` contains a completed strong backtest.
- `persistedActions` does not contain a completed `strategy` action.

Expected primary action:

```js
{
  kind: "save_and_accept_paper_candidate",
  label: "保存并采用 paper",
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because the autonomous command currently returns `accept_paper_candidate`.

**Step 3: Implement minimal helper change**

Add a helper near `aiAutonomousCommandFromState()` that:

- Detects `primaryAction.kind === "accept_paper_candidate"`.
- Checks `persistedActions.strategy.status`.
- Returns `save_and_accept_paper_candidate` only when the strategy is not saved.
- Leaves already saved strategies unchanged.

### Task 2: Wire The Top CTA

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend the panel props**

Pass `saveAndAcceptPaperCandidate` into `AIAutonomousCommandPanel`.

**Step 2: Handle the combined action**

In the primary button switch, handle `save_and_accept_paper_candidate` when a candidate exists:

- Button label comes from the action.
- Use `isWorking` as disabled guard.
- Call `onSaveAndAcceptPaperCandidate(candidate)`.

### Task 3: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: tests/typecheck pass; lint has no errors and may retain the known warning in `client/data/use-activity-center.tsx`.

Implementation Checklist:
1. Add the autonomous command failing test.
2. Verify the test fails for the old action kind.
3. Normalize unsaved autonomous paper adoption to save-and-adopt.
4. Wire `AIAutonomousCommandPanel` to the combined handler.
5. Run full verification commands.
