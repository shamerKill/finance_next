# AI Now Sentiment Review Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Money current-task panel complete the evidence-backed sentiment review directly when that is the next required human step.

**Architecture:** `aiNowActionFromState` decides the current primary action. When daily mission selects `sentiment_review`, it should return a manual action descriptor instead of only an open-link action. The React panel then resolves that descriptor to the existing action queue item and reuses `manualActionTransition` through `updateQueueAction`, so the backend evidence guard remains authoritative.

**Tech Stack:** Next.js client component, shared AI goal helper module, Node.js built-in test runner.

## Context

The AI Money flow already blocks paper adoption on heated public opinion, FOMO, or crowding until `sentiment_review` is complete. The previous current-task primary button only opened the news page, forcing the operator to find the action queue and complete the review there. This made the workflow less direct even though the evidence note is already standardized.

## Implementation Plan

### Task 1: Add the RED Helper Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiNowActionFromState makes heated sentiment review directly completable`. The test creates a strong validated paper candidate with heated FOMO/crowding signals and no completed sentiment review.

Expected primary action:

```js
{
  kind: "complete_manual_action",
  label: "完成风向 / 人性复核",
  actionId: "sentiment_review",
}
```

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the existing behavior returns `{ kind: "open_link", label: "打开风向复核" }`.

### Task 2: Implement the Current-Task Manual Action

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Data helper minimal implementation**

Change `nowActionPrimaryFromTask` so `actionKind === "sentiment_review"` returns `complete_manual_action` with `actionId: "sentiment_review"` and still keeps `primaryHref: "/data-explorer/news"` for context.

**Step 2: UI minimal implementation**

In `AI Money` client:
- Add `complete_manual_action` / `actionId` to `AINowActionState.primaryAction`.
- Resolve the current action item with `actionPlanFromAnalysis(analysis, activeActions)`.
- Pass that item into `AINowActionPanel`.
- Render a primary button that calls the existing `onUpdateAction(manualAction)` handler.

**Step 3: Run tests**

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`

Expected: both pass.

## Implementation Checklist:

1. Add the RED helper test.
2. Run the frontend helper test and confirm RED.
3. Update `nowActionPrimaryFromTask` for `sentiment_review`.
4. Wire `AINowActionPanel` to the existing manual action update flow.
5. Re-run helper tests and typecheck.
6. Run lint and diff checks.

## Task Progress

* 2026-06-03 04:55:31 CST
  * Step: 1-5
  * Modifications: Added helper test, changed the current-task primary action, and wired the AI current-task panel to update the existing sentiment review action.
  * Change Summary: Operators can now complete the evidence-backed wind/human review from the AI current task instead of searching the action queue.
  * Reason: Reduce friction in the AI-assisted money workflow while preserving evidence-gated safety.
  * Blockers: None
