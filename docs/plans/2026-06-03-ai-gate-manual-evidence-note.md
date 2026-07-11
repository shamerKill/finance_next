# AI Gate Manual Evidence Note Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the frontend manual gate completion action submit evidence text accepted by the backend AI goal action evidence guard.

**Architecture:** The frontend helper `manualActionTransition` owns operator-facing status transitions for AI goal run actions. Backend validation now rejects `gate` completion unless the note mentions kill switch, portfolio limits, trading gate, and paper review evidence, so the frontend must produce that evidence-backed note for manual gate completion.

**Tech Stack:** Next.js data helpers, Node.js built-in test runner.

## Context

The backend action patch guard rejects `gate` actions marked `done` without explicit execution safety evidence. The frontend still used the generic manual completion note for `gate`, which would cause the UI action to be rejected by the API.

## Implementation Plan

### Task 1: Lock the Required Gate Manual Completion Behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add an assertion to `manualActionTransition only allows human checklist actions to advance` that expects a `gate` manual action to return:

```js
{
  label: "完成执行闸门复核",
  nextStatus: "done",
  note: "已确认 kill switch、组合限额、交易闸门和 paper 复盘证据；只允许进入测试网前检查。",
}
```

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the current implementation returns the generic `"标记完成"` label and a generic manual confirmation note.

### Task 2: Produce the Evidence-Backed Gate Completion Note

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Add a specific `id === "gate"` branch in `manualActionTransition`, after the `paper_watch` branch and before the generic manual completion fallback.

**Step 2: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS with all AI goal preset tests green.

## Implementation Checklist:

1. Add a frontend unit test for manual `gate` completion evidence text.
2. Run the target frontend test and confirm it fails for the expected reason.
3. Add the minimal `gate` branch in `manualActionTransition`.
4. Re-run the target frontend test and confirm it passes.
5. Run `yarn typecheck` in `client/`.
6. Run `yarn lint` in `client/`.
7. Run `git diff --check`.

## Task Progress

* 2026-06-03 04:46:38 CST
  * Step: 1-4
  * Modifications: Added a gate-specific frontend test and a gate-specific manual transition branch.
  * Change Summary: Frontend manual gate completion now submits evidence text covering kill switch, portfolio limits, trading gate, and paper review evidence.
  * Reason: Aligning frontend AI goal run action completion with backend evidence guard.
  * Blockers: None
