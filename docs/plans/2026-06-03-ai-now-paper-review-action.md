# AI Now Paper Review Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Money current-task panel directly repair thin paper review evidence.

**Architecture:** `aiNowActionFromState` already detects when a persisted `paper_watch` action is marked done with insufficient evidence. Instead of returning only an open-link action, it should return `complete_manual_action` with `actionId: "paper_watch"`. The existing AI Now panel integration resolves that action through `actionPlanFromAnalysis`, so completion still uses `manualActionTransition` and the backend `paper_watch` evidence guard.

**Tech Stack:** Next.js AI Money client, shared AI goal helper module, Node.js built-in test runner.

## Context

The project now rejects thin `paper_watch done` notes and reopens them in the action queue. The current-task panel still surfaced this state as a link, which forced the operator to find the action queue before submitting the standard 24-72h paper review evidence note.

## Implementation Plan

### Task 1: Add the RED Helper Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Update `aiNowActionFromState keeps thin completed paper watch as human review task` to expect:

```js
{
  kind: "complete_manual_action",
  label: "补齐 paper 复盘证据",
  actionId: "paper_watch",
}
```

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because current behavior returns `{ kind: "open_link", label: "补齐 paper 复盘证据" }`.

### Task 2: Implement the Paper Review Current Action

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Minimal implementation**

In the `paperWatch?.status === "done" && !paperWatchCompletionHasEvidence(paperWatch)` branch, return:

```js
primaryAction: {
  kind: "complete_manual_action",
  label: "补齐 paper 复盘证据",
  actionId: "paper_watch",
}
```

Keep `primaryHref` pointing to the saved backtest/run page for review context.

**Step 2: Run tests**

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`

Expected: both pass.

## Implementation Checklist:

1. Update the thin paper review helper test.
2. Run the frontend helper test and confirm RED.
3. Return `complete_manual_action` for thin `paper_watch` evidence.
4. Re-run frontend helper tests and typecheck.
5. Run lint and diff checks.

## Task Progress

* 2026-06-03 04:58:17 CST
  * Step: 1-4
  * Modifications: Updated the helper test and changed the thin paper review current-task primary action.
  * Change Summary: The AI current task can now directly repair paper review evidence using the existing paper watch action contract.
  * Reason: Reduce friction between validated paper candidates and evidence-gated testnet readiness.
  * Blockers: None
