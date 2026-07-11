# AI Market Memory Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI's remembered market direction, sentiment / human-risk assumptions, and watch signals visible on the AI Money page.

**Architecture:** Add a pure `aiMarketMemoryFromState` helper in `client/data/ai-goal-preset.mjs` that reads `analysis.context.recentRunSummaries` and falls back to recent run metadata when no active analysis exists. Render the result as a compact panel in `client/app/(dashboard)/ai-money/client.tsx`.

**Tech Stack:** Next.js client page, existing Section / Stat / StatusBadge components, Node test runner, TypeScript typecheck.

# Context
Filename: `docs/plans/2026-06-03-ai-market-memory-panel.md`
Created On: 2026-06-03 03:00:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project toward goal-driven AI usage: the user gives a target, AI analyzes market direction, public narrative, and human behavior, and the UI makes that AI participation easy to observe and act on.

# Project Overview
The backend now includes recent market memory in `context.recentRunSummaries`, but the AI Money page does not yet expose those fields. Users can see command states and current sentiment, but not the remembered market assumptions that AI carries into future analysis.

# Analysis
`client/data/ai-goal-preset.mjs` already centralizes derived AI Money states and has tests for each state helper. `client/app/(dashboard)/ai-money/client.tsx` renders a sequence of panels from those states. A new helper and panel can keep behavior deterministic, tested, and easy to wire without changing backend APIs.

# Proposed Solution
Add `aiMarketMemoryFromState({ analysis, runs })` that returns:

- `stage`, `tone`, `title`, `summary`
- `metrics`: remembered run count, human factor count, watch signal count
- `items`: recent memory cards with market read, human factors, watch signals, and link to the run
- `nextActions`: safe actions such as rescan when no memory exists

Render it after `AIMarketWatchtowerPanel`, before the sentiment compass, because it is context continuity rather than current sentiment.

# Implementation Plan

### Task 1: Frontend RED Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `aiMarketMemoryFromState` to the existing import list.

**Step 2: Add test**

Add a test near the existing market / sentiment tests:

```js
test("aiMarketMemoryFromState surfaces recent market and human memory", () => {
  const memory = aiMarketMemoryFromState({
    analysis: {
      context: {
        recentRunSummaries: [
          {
            id: "goal_new",
            goal: "BTC 新风向",
            marketRead: "ETF 资金转暖但社媒拥挤。",
            humanFactors: ["FOMO 追涨", "拥挤交易"],
            watchSignalCount: 2,
            watchSignalHighlights: ["ETF 流入放缓", "资金费率过热"],
            openActionCount: 1,
          },
        ],
      },
    },
  });

  assert.equal(memory.stage, "remembering");
  assert.equal(memory.metrics[0].value, 1);
  assert.equal(memory.metrics[1].value, 2);
  assert.equal(memory.metrics[2].value, 2);
  assert.equal(memory.items[0].marketRead, "ETF 资金转暖但社媒拥挤。");
  assert.deepEqual(memory.items[0].humanFactors, ["FOMO 追涨", "拥挤交易"]);
  assert.deepEqual(memory.items[0].watchSignals, ["ETF 流入放缓", "资金费率过热"]);
  assert.equal(memory.items[0].href, "/ai-money?runId=goal_new");
});
```

**Step 3: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiMarketMemoryFromState` is not exported.

### Task 2: Helper Implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add `aiMarketMemoryFromState({ analysis = null, runs = [] } = {})`.

Rules:
- Prefer `analysis.context.recentRunSummaries`.
- Keep at most 3 memory items.
- Include only rows that have `marketRead`, `humanFactors`, or `watchSignalHighlights`.
- Deduplicate human and watch strings using existing `safeStringList`.
- When no memory exists, return `stage: "empty"`, warning tone, and a scan action.

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

Add `aiMarketMemoryFromState` to the `@/data/ai-goal-preset.mjs` import list.

**Step 2: Add TypeScript types**

Add `AIMarketMemoryItem` and `AIMarketMemoryState` local types near the market watchtower types.

**Step 3: Build state**

Add:

```ts
const buildMarketMemory = aiMarketMemoryFromState as unknown as (input: {
  analysis: TypeAIGoalAnalysis | null;
  runs: TypeAIGoalRun[];
}) => AIMarketMemoryState;
const marketMemory = buildMarketMemory({ analysis, runs });
```

**Step 4: Render panel**

Render `<AIMarketMemoryPanel state={marketMemory} />` after `AIMarketWatchtowerPanel`.

**Step 5: Add component**

Add `AIMarketMemoryPanel` near `AIMarketWatchtowerPanel`. Use existing `Section`, `Stat`, `StatusBadge`, `PlanList`, and `Link`. Keep it compact and avoid nested cards.

### Task 4: Verification

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs client/app/\(dashboard\)/ai-money/client.tsx docs/plans/2026-06-03-ai-market-memory-panel.md
```

Expected:
- Node tests pass.
- Typecheck passes.
- Lint exits 0; known unrelated warning may remain.
- Diff check passes.
- No trailing whitespace matches.

Implementation Checklist:
1. Import `aiMarketMemoryFromState` in the test file.
2. Add RED test for recent market / human memory.
3. Run Node test and confirm RED.
4. Implement `aiMarketMemoryFromState`.
5. Run Node test and confirm GREEN.
6. Import helper in the AI Money page.
7. Add market memory local types.
8. Build market memory state.
9. Render `AIMarketMemoryPanel`.
10. Implement `AIMarketMemoryPanel`.
11. Run verification commands.
12. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Completed"

# Task Progress
*   2026-06-03 03:02:08 CST
    *   Step: 1-3. Import helper in the test file, add RED test, and run Node tests.
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` to import `aiMarketMemoryFromState` and assert market read, human factors, watch signals, metrics, and run link from recent summaries.
    *   Change Summary: Confirmed RED with missing export failure for `aiMarketMemoryFromState`.
    *   Reason: Executing implementation checklist steps 1-3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:02:08 CST
    *   Step: 4-5. Implement helper and confirm GREEN.
    *   Modifications: Added `aiMarketMemoryFromState`, `marketMemoryTextList`, `marketMemoryItemsFromSummaries`, and `marketMemoryItemsFromRuns` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: The helper converts recent AI market memory into deterministic UI state with metrics, memory items, next actions, and safe empty-state guidance.
    *   Reason: Executing implementation checklist steps 4-5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:02:08 CST
    *   Step: 6-10. Wire helper into AI Money page and render the panel.
    *   Modifications: Imported `aiMarketMemoryFromState`; added `AIMarketMemoryItem` / `AIMarketMemoryState`; built `marketMemory`; rendered `AIMarketMemoryPanel` after the market watchtower; added the panel component using existing `Section`, `Stat`, `StatusBadge`, `PlanList`, and `Link`.
    *   Change Summary: The AI Money page now shows remembered market direction, human / sentiment risks, and watch signals from prior AI runs.
    *   Reason: Executing implementation checklist steps 6-10.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:02:08 CST
    *   Step: 11. Run verification commands.
    *   Modifications: No code changes.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs` passed 117/117; `yarn typecheck` passed; `yarn lint` exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; `git diff --check` passed; trailing whitespace scan found no matches; local smoke returned `/ai-money -> /login?next=%2Fai-money -> 200 OK` and no dev server process remained on port 3000.
    *   Reason: Executing implementation checklist step 11.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The RED/GREEN cycle proves the helper surfaces recent market and human memory from `context.recentRunSummaries`. The page wiring uses that helper as the single derived-state source and renders the memory panel without changing backend APIs or execution behavior. No unreported deviations were detected.
