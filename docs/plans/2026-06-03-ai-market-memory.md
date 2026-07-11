# AI Market Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve previous AI market direction, human behavior risks, and watch signals in recent-run memory so each new AI goal analysis can reason from prior market / sentiment context instead of starting from a thin summary.

**Architecture:** Extend the backend recent-run summary with safe excerpts extracted from the persisted `analysis` map. Include those excerpts in `buildGoalPrompt` memory lines and expose them through the existing `context.recentRunSummaries` response shape for the frontend.

**Tech Stack:** Go Echo handler tests, Mongo run document map fields, TypeScript client types.

# Context
Filename: `docs/plans/2026-06-03-ai-market-memory.md`
Created On: 2026-06-03 02:49:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project toward goal-driven AI usage: the user gives an objective, AI analyzes market direction, sentiment, public narrative, human behavior, and execution gates, then helps progress safely through validation and paper execution. This task improves AI participation by carrying previous market / human context into the next analysis.

# Project Overview
`gateway/internal/http/handlers/ai_goal.go` builds goal-agent prompts and recent run summaries. Runs persist the full analysis map, but recent memory currently forwards only summary, context counts, and action handoff state. That weakens the AI's ability to notice changing market narrative and human-risk assumptions across repeated scans.

# Analysis
`AIGoalRunDoc.Analysis` already stores full structured fields such as `marketRead`, `humanFactors`, and `watchSignals`. `summarizeRecentGoalRuns` and `writeRecentGoalRunMemory` can safely extract short, bounded excerpts without adding a new collection or schema migration. `client/data/type.d.ts` should reflect the added JSON fields so frontend code can consume them later.

# Proposed Solution
Add `marketRead`, `humanFactors`, `watchSignalCount`, and `watchSignalHighlights` to `aiGoalRecentRunSummary` / `TypeAIGoalRecentRunSummary`. Extract them from `run.Analysis` with conservative helpers that tolerate missing legacy data and cap lengths. Update prompt memory to include a `marketMemory` line per recent run only when at least one excerpt exists.

# Implementation Plan

### Task 1: Backend RED Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Add recent market memory data to prompt test**

In the recent-memory prompt test, add `Analysis` on the recent runs:

- `marketRead: "ETF 资金转暖但社媒拥挤。"`
- `humanFactors: ["FOMO 追涨", "拥挤交易"]`
- `watchSignals: [{"signal":"ETF 流入放缓","source":"news"},{"signal":"资金费率过热","source":"price"}]`

Assert the prompt includes:

- `marketMemory read=ETF 资金转暖但社媒拥挤。`
- `human=FOMO 追涨 | 拥挤交易`
- `watch=ETF 流入放缓 | 资金费率过热`

**Step 2: Add summary assertion**

In `TestSummarizeGoalContextIncludesRecentRunMemory`, add the same analysis map to one run and assert:

- `MarketRead == "ETF 资金转暖但社媒拥挤。"`
- `HumanFactors == []string{"FOMO 追涨", "拥挤交易"}`
- `WatchSignalCount == 2`
- `WatchSignalHighlights == []string{"ETF 流入放缓", "资金费率过热"}`

**Step 3: Run RED**

Run:

```bash
cd gateway && go test ./internal/http/handlers -run 'TestBuildGoalPromptIncludesRecentRunMemory|TestSummarizeGoalContextIncludesRecentRunMemory' -count=1
```

Expected: FAIL because the summary fields and prompt memory line do not exist yet.

### Task 2: Backend Implementation

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Extend summary struct**

Add fields to `aiGoalRecentRunSummary`:

- `MarketRead string`
- `HumanFactors []string`
- `WatchSignalCount int`
- `WatchSignalHighlights []string`

**Step 2: Add extraction helpers**

Add helpers near `summarizeRecentGoalRuns`:

- `goalAnalysisString(m map[string]any, key string, limit int) string`
- `goalAnalysisStringList(m map[string]any, key string, limit int) []string`
- `goalAnalysisWatchSignalHighlights(m map[string]any, limit int) []string`

They should handle `[]any`, `[]string`, and map values defensively, trim values, cap count, and use existing `compactGoalPromptText` for length safety.

**Step 3: Populate summary**

In `summarizeRecentGoalRuns`, compute highlights from `run.Analysis` and set all new fields.

**Step 4: Write market memory line**

In `writeRecentGoalRunMemory`, after the action handoff line, write:

```text
  run=<id> marketMemory read=<marketRead> human=<a | b> watch=<x | y>
```

only when at least one of the three groups is non-empty.

### Task 3: Client Type Wiring

**Files:**
- Modify: `client/data/type.d.ts`

**Step 1: Extend `TypeAIGoalRecentRunSummary`**

Add optional fields:

- `marketRead?: string`
- `humanFactors?: string[]`
- `watchSignalCount?: number`
- `watchSignalHighlights?: string[]`

### Task 4: Verification

Run:

```bash
cd gateway && go test ./internal/http/handlers -run 'TestBuildGoalPromptIncludesRecentRunMemory|TestSummarizeGoalContextIncludesRecentRunMemory' -count=1
cd gateway && go test ./internal/http/handlers -count=1
cd client && yarn typecheck
git diff --check
rg -n "[[:blank:]]$" gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go client/data/type.d.ts docs/plans/2026-06-03-ai-market-memory.md
```

Expected:
- Target backend tests pass after RED/GREEN.
- Handler package tests pass.
- Typecheck passes.
- Diff check passes.
- No trailing whitespace matches.

Implementation Checklist:
1. Add failing backend prompt-memory assertions.
2. Add failing backend recent-summary assertions.
3. Run the target Go tests and confirm RED.
4. Extend `aiGoalRecentRunSummary`.
5. Add safe analysis extraction helpers.
6. Populate recent-run market memory fields.
7. Write the bounded `marketMemory` prompt line.
8. Extend `TypeAIGoalRecentRunSummary`.
9. Add a real `buildGoalContext` path regression test if recent run `Analysis` is stripped before summary extraction.
10. Run target and package verification.
11. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Completed"

# Task Progress
*   2026-06-03 02:53:55 CST
    *   Step: 1-3. Add backend RED tests and run target tests.
    *   Modifications: Updated `gateway/internal/http/handlers/ai_goal_test.go` so recent AI goal memory must include market read, human factors, and watch signal highlights in both prompt memory and recent-run summaries.
    *   Change Summary: Confirmed RED with missing `aiGoalRecentRunSummary` fields.
    *   Reason: Executing implementation checklist steps 1-3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:53:55 CST
    *   Step: 4-8. Implement backend market memory and extend client type.
    *   Modifications: Added `MarketRead`, `HumanFactors`, `WatchSignalCount`, and `WatchSignalHighlights` to `aiGoalRecentRunSummary`; added safe extraction helpers in `gateway/internal/http/handlers/ai_goal.go`; wrote bounded `marketMemory` prompt lines; extended `TypeAIGoalRecentRunSummary` in `client/data/type.d.ts`.
    *   Change Summary: Recent AI runs now carry safe excerpts of previous market direction, human / sentiment risks, and watch signals into summaries and prompts.
    *   Reason: Executing implementation checklist steps 4-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:53:55 CST
    *   Step: 9. Add real `buildGoalContext` regression coverage.
    *   Modifications: Added `TestAIGoalBuildContextPreservesRecentRunMarketMemory` and `fakeAIGoalRunStore`; removed the `row.Analysis = nil` line from `buildGoalContext`.
    *   Change Summary: The first implementation passed direct summary tests but would not work through the real context builder because it stripped persisted analysis. The new test failed with empty `MarketRead`, then passed after preserving analysis for bounded extraction.
    *   Reason: Correcting a discovered execution-path gap in the planned feature.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:53:55 CST
    *   Step: 10. Run verification commands.
    *   Modifications: No code changes.
    *   Change Summary: Target Go tests passed; `go test ./internal/http/handlers -count=1` passed; `yarn typecheck` passed; `git diff --check` passed; trailing whitespace scan found no matches.
    *   Reason: Executing implementation checklist step 10.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan, with one reported correction: `buildGoalContext` was preserving only top-level run metadata and stripping `Analysis`, so the planned market-memory extraction would not run in the real request path. A RED regression test was added before the correction, and the final code keeps persisted analysis available only inside the context object while exposing bounded fields through summary and prompt helpers.

No unreported deviations were detected. The implementation improves the full objective by making repeated AI scans remember market direction, public narrative, human behavior risks, and watch signals from prior runs.
