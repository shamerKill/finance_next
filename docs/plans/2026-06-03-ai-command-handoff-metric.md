# AI Command Handoff Metric Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show, in the AI command center, how many next steps AI can safely handle versus how many still require the user, making AI participation easier to observe.

**Architecture:** Reuse the existing delegation runbook state as the source of truth for AI-owned and human-owned steps. Add a small frontend helper that counts current/ready steps, then add a compact `交接` metric to `aiCommandCenterFromState`. This does not add execution actions or trading permissions.

**Tech Stack:** Existing `client/data/ai-goal-preset.mjs` pure state helpers and Node test runner.

# Context
Filename: `docs/plans/2026-06-03-ai-command-handoff-metric.md`
Created On: 2026-06-03 02:38:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project so the user can give AI a money-making target and more easily observe which parts AI can analyze, validate, and prepare, while preserving human confirmation for risky steps.

# Project Overview
The AI Money page already has an AI command center and an AI delegation runbook. The runbook contains the split between `aiSteps` and `humanSteps`, but the top command center does not expose this split in its dense metrics. Adding it there makes the first visible control surface more useful without adding another panel.

# Analysis
`client/data/ai-goal-preset.mjs::aiCommandCenterFromState` builds the top command-center state and metrics. `aiDelegationRunbookFromState` already computes stage-specific AI and human steps. Reusing the runbook in the command center avoids duplicating the same ownership logic. Tests for the command center live in `client/data/ai-goal-preset.test.mjs`.

# Proposed Solution
Add a helper such as `handoffCountsFromRunbook(runbook)` that counts AI steps and human steps with status `ready` or `current`. Then add a `交接` metric to both idle and active command center states. For idle states, the metric should read `2 AI / 1 你`. For active states, it should reflect the current runbook stage, for example a runnable AI draft with no validation should show AI work available and human restraint/check steps.

# Implementation Plan

### Task 1: Frontend RED Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Extend idle command center test**

In `aiCommandCenterFromState starts idle users with a safe scan command`, add:

```js
const handoff = center.metrics.find((item) => item.label === "交接");
assert.equal(handoff.value, "2 AI / 1 你");
assert.ok(handoff.hint.includes("AI 可代办"));
```

**Step 2: Add active validation handoff test**

Add a test near the command center tests:

```js
test("aiCommandCenterFromState surfaces AI and human handoff counts", () => {
  const center = aiCommandCenterFromState({
    analysis: {
      goal: "BTC 自动验证",
      summary: "AI 生成可回测蓝图。",
      context: { notes: [], newsCount: 2, macroCount: 1, onchainCount: 1, symbols: ["BTC"] },
      execution: { mode: "paper", safetyGates: [] },
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      humanFactors: [],
      watchSignals: [],
    },
    persistedActions: [],
    validationRuns: [],
    dailyRadarStatus: { hasToday: true, isStale: false, summary: "今日已扫描。" },
  });

  const handoff = center.metrics.find((item) => item.label === "交接");
  assert.equal(handoff.value, "1 AI / 1 你");
  assert.ok(handoff.hint.includes("AI 可代办"));
  assert.ok(handoff.hint.includes("你确认"));
});
```

**Step 3: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because the `交接` metric does not exist.

### Task 2: Implement Handoff Metric

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add near command center helpers:

```js
function handoffCountsFromRunbook(runbook) { ... }
```

Rules:
- Count steps whose `status` is `ready` or `current`.
- Return `{ ai, human }`.
- Treat missing arrays as empty.

**Step 2: Add idle metric**

In the no-analysis branch of `aiCommandCenterFromState`, add:

```js
{ label: "交接", value: "2 AI / 1 你", hint: "AI 可代办扫描和蓝图；你确认目标" }
```

**Step 3: Add active metric**

In the active branch, compute:

```js
const handoffCounts = handoffCountsFromRunbook(aiDelegationRunbookFromState({ ...same inputs... }));
```

Then append a metric:

```js
{
  label: "交接",
  value: `${handoffCounts.ai} AI / ${handoffCounts.human} 你`,
  hint: `AI 可代办 ${handoffCounts.ai} 项；你确认 ${handoffCounts.human} 项`,
}
```

### Task 3: Verification

**Files:**
- No planned code changes.

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-command-handoff-metric.md
```

Expected:
- Node tests pass.
- Typecheck passes.
- Lint exits 0; the known `client/data/use-activity-center.tsx:138` warning may remain.
- No trailing whitespace.

Implementation Checklist:
1. Extend idle command center test with `交接` metric assertions.
2. Add active command center handoff count test.
3. Run the Node test and confirm RED.
4. Add `handoffCountsFromRunbook`.
5. Add idle `交接` metric.
6. Add active `交接` metric from `aiDelegationRunbookFromState`.
7. Run verification commands.
8. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 02:38 CST
    *   Step: 1. Extend idle command center test with `交接` metric assertions.
    *   Modifications: Added assertions that the idle command center shows `2 AI / 1 你` and an AI handoff hint.
    *   Change Summary: The idle state now has a test for visible AI/user ownership.
    *   Reason: Executing plan step 1.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:38 CST
    *   Step: 2. Add active command center handoff count test.
    *   Modifications: Added a runnable-draft command center test expecting `1 AI / 1 你`.
    *   Change Summary: The active state now has a test for AI validation handoff and human guard confirmation.
    *   Reason: Executing plan step 2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:39 CST
    *   Step: 3. Run the Node test and confirm RED.
    *   Modifications: No file modifications.
    *   Change Summary: RED confirmed because both tests failed when no `交接` metric existed.
    *   Reason: Executing plan step 3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:39 CST
    *   Step: 4. Add `handoffCountsFromRunbook`.
    *   Modifications: Added a pure helper that counts `ready` and `current` AI/human runbook steps.
    *   Change Summary: Command center can now derive ownership counts from the existing delegation runbook.
    *   Reason: Executing plan step 4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:39 CST
    *   Step: 5. Add idle `交接` metric.
    *   Modifications: Added `交接` metric to the no-analysis command center metrics.
    *   Change Summary: Idle users can see AI will handle scan/blueprint while they confirm the goal.
    *   Reason: Executing plan step 5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:40 CST
    *   Step: 6. Add active `交接` metric from `aiDelegationRunbookFromState`.
    *   Modifications: Active command center now computes runbook handoff counts and shows a `交接` metric; the AI validation runbook human guard step was marked `current`.
    *   Change Summary: Active users can see how many next steps AI can handle and how many require their confirmation.
    *   Reason: Executing plan step 6.
    *   Blockers: Minor deviation handled: the runnable-draft runbook had the human “不要提前采用” guard as `pending`, so the metric reported `0 你`; marking it `current` matches the plan's intended `1 AI / 1 你` ownership split.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:41 CST
    *   Step: 7. Run verification commands.
    *   Modifications: No file modifications.
    *   Change Summary: Verification passed: Node test 115/115, `yarn typecheck`, `yarn lint` with 0 errors and the known `use-activity-center.tsx:138` warning, `git diff --check`, and touched-file trailing whitespace scan.
    *   Reason: Executing plan step 7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:42 CST
    *   Step: 8. Append task progress and final review to this plan document.
    *   Modifications: Updated this plan's Current Execution Step, Task Progress, and Final Review sections.
    *   Change Summary: Documented implementation evidence and compliance review.
    *   Reason: Executing plan step 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan, with one reported minor correction to mark the active human validation guard as `current` so the planned handoff count is visible.

The command center now exposes a compact `交接` metric. Idle state shows `2 AI / 1 你`; active runnable-draft state derives counts from the delegation runbook and shows `1 AI / 1 你`. This improves observability of AI participation without adding any trading route, order submission, execution permission, or safety-gate bypass.

Verification evidence:
- RED: `node --test client/data/ai-goal-preset.test.mjs` failed because the `交接` metric did not exist.
- GREEN: `node --test client/data/ai-goal-preset.test.mjs` passed with 115/115 tests.
- `cd client && yarn typecheck` passed.
- `cd client && yarn lint` passed with 0 errors and the known warning in `client/data/use-activity-center.tsx:138`.
- `git diff --check` passed.
- `rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-command-handoff-metric.md` found no trailing whitespace.
