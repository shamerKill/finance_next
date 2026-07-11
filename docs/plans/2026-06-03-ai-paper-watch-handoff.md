# AI Paper Watch Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist a richer AI paper-watch handoff when the user adopts a paper candidate, so future AI runs remember the observation window, stop rules, and sentiment / human triggers.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that converts `paperObservationPlanFromCandidate` into the exact action patch for `paper_watch`. Use it in `client/app/(dashboard)/ai-money/client.tsx::acceptPaperCandidate`.

**Tech Stack:** Existing AI Money helper module, Node test runner, Next.js client state, TypeScript typecheck.

# Context
Filename: `docs/plans/2026-06-03-ai-paper-watch-handoff.md`
Created On: 2026-06-03 03:08:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project toward goal-driven AI usage: the user gives a target, AI analyzes, validates, recommends a paper candidate, and the project makes it easy to hand that candidate into a safe observation workflow without losing market, sentiment, or human-risk assumptions.

# Project Overview
`acceptPaperCandidate` currently persists `paper_watch` with a short metrics-only note. Future AI memory can see that a paper watch exists, but it cannot see the AI's observation window, first stop rule, or key watch trigger. `paperObservationPlanFromCandidate` already computes that information.

# Analysis
The safest improvement is not to automate real trading. It is to make the paper handoff more complete and reusable: when the user adopts a candidate, the action note should contain the observation plan that AI should remember and continue. A pure helper lets this behavior be tested outside the React component.

# Proposed Solution
Add `paperWatchActionPatchFromCandidate(analysis, candidate)` returning:

- `status: "manual"`
- `relatedId: candidate.strategyId`
- `href: candidate.backtestHref`
- `note`: concise Chinese handoff including candidate name, score, backtest run, observation window, return/drawdown/sharpe metrics, first stop rule, and first watch trigger / action.

Use this helper in `acceptPaperCandidate` instead of building the note inline.

# Implementation Plan

### Task 1: Frontend RED Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `paperWatchActionPatchFromCandidate` to the import list.

**Step 2: Add test near paper observation tests**

Add:

```js
test("paperWatchActionPatchFromCandidate persists the AI paper observation handoff", () => {
  const patch = paperWatchActionPatchFromCandidate(
    {
      watchSignals: [
        {
          source: "human",
          signal: "社媒 FOMO",
          interpretation: "追涨情绪升温。",
          action: "降低 paper 仓位。",
        },
      ],
      humanFactors: ["拥挤交易风险"],
    },
    {
      strategyId: "btca",
      runId: "run_backtest_1",
      score: 82,
      totalReturn: 0.18,
      maxDrawdown: 0.08,
      sharpe: 1.35,
      backtestHref: "/backtests/run_backtest_1",
      draft: { name: "btca" },
    },
  );

  assert.equal(patch.status, "manual");
  assert.equal(patch.relatedId, "btca");
  assert.equal(patch.href, "/backtests/run_backtest_1");
  assert.ok(patch.note.includes("AI paper 观察计划"));
  assert.ok(patch.note.includes("24-72 小时"));
  assert.ok(patch.note.includes("社媒 FOMO"));
  assert.ok(patch.note.includes("降低 paper 仓位"));
  assert.ok(patch.note.includes("回撤"));
});
```

**Step 3: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because the helper export does not exist.

### Task 2: Helper Implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add `paperWatchActionPatchFromCandidate(analysis, candidate)` near `paperObservationPlanFromCandidate`.

Rules:
- Return `null` when `candidate` is missing.
- Reuse `paperObservationPlanFromCandidate`.
- Keep note concise and deterministic.
- Include the first stop rule and first trigger when available.
- Use existing `formatPercentValue` and `Number(...).toFixed(2)` patterns.

**Step 2: Run GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Page Wiring

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Add `paperWatchActionPatchFromCandidate` to the import list.

**Step 2: Use helper in `acceptPaperCandidate`**

Replace the inline `paper_watch` patch object with:

```ts
const paperWatchPatch = paperWatchActionPatchFromCandidate(
  analysis,
  candidate,
) as TypeAIGoalRunActionPatch | null;
if (!paperWatchPatch) {
  setError(new Error("无法生成 AI paper 观察交接。"));
  return;
}
const updated = await updateAIGoalRunAction(
  analysis.id,
  "paper_watch",
  paperWatchPatch,
);
```

### Task 4: Verification

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs client/app/\(dashboard\)/ai-money/client.tsx docs/plans/2026-06-03-ai-paper-watch-handoff.md
```

Expected:
- Node tests pass.
- Typecheck passes.
- Lint exits 0; known unrelated warning may remain.
- Diff check passes.
- No trailing whitespace matches.

Implementation Checklist:
1. Import `paperWatchActionPatchFromCandidate` in the test file.
2. Add RED test for rich AI paper-watch handoff.
3. Run Node test and confirm RED.
4. Implement `paperWatchActionPatchFromCandidate`.
5. Run Node test and confirm GREEN.
6. Import helper in AI Money page.
7. Use helper in `acceptPaperCandidate`.
8. Run verification commands.
9. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Completed"

# Task Progress
*   2026-06-03 03:08:37 CST
    *   Step: 1-3. Import helper in the test file, add RED test, and run Node tests.
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` to import `paperWatchActionPatchFromCandidate` and assert that the patch contains status, related ID, href, paper observation text, window, trigger, trigger action, and drawdown context.
    *   Change Summary: Confirmed RED with missing export failure for `paperWatchActionPatchFromCandidate`.
    *   Reason: Executing implementation checklist steps 1-3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:08:37 CST
    *   Step: 4-5. Implement helper and confirm GREEN.
    *   Modifications: Added `compactPaperWatchNote` and `paperWatchActionPatchFromCandidate` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: Paper candidate adoption can now persist a concise AI observation handoff with score, backtest run, observation window, metrics, stop rule, and first trigger.
    *   Reason: Executing implementation checklist steps 4-5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:08:37 CST
    *   Step: 6-7. Wire helper into the AI Money page.
    *   Modifications: Imported `paperWatchActionPatchFromCandidate`; imported `TypeAIGoalRunActionPatch`; replaced the inline `paper_watch` action payload in `acceptPaperCandidate` with the helper output.
    *   Change Summary: Adopting a paper candidate now writes the richer handoff into persisted run actions, which future AI memory can reuse.
    *   Reason: Executing implementation checklist steps 6-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:08:37 CST
    *   Step: 8. Run verification commands.
    *   Modifications: No code changes.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs` passed 118/118; `yarn typecheck` passed; `yarn lint` exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; `git diff --check` passed; trailing whitespace scan found no matches; local smoke returned `/ai-money -> /login?next=%2Fai-money -> 200 OK` and no dev server process remained on port 3000.
    *   Reason: Executing implementation checklist step 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The RED/GREEN cycle proves the new helper persists the AI paper observation handoff. The page now uses the helper as the single source for `paper_watch` action patches, preserving observation windows, stop rules, and sentiment / human triggers for future AI memory. No unreported deviations were detected.
