# AI Action Handoff Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI goal analysis continue from prior action outcomes instead of treating every scan as stateless, while making unresolved historical AI actions visible in the command center.

**Architecture:** Extend backend recent-run memory with action status counts and explicit handoff rules in the AI prompt. Add the same count fields to the response summary and frontend type, then have the AI command center surface unresolved historical actions in its memory evidence text. This preserves all execution gates and does not introduce order submission.

**Tech Stack:** Go Echo handler prompt helpers and tests, Mongo run action shape, Next.js TypeScript shared types, existing `client/data/ai-goal-preset.mjs` pure helpers and Node tests.

# Context
Filename: `docs/plans/2026-06-03-ai-action-handoff-memory.md`
Created On: 2026-06-03 02:27:13 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project so the user can give AI a money-making objective, AI can analyze market context, human behavior, market narratives, public opinion, and prior decisions, then generate and safely advance strategy actions with more AI participation and better observability.

# Project Overview
`finance_next` has an AI Money route and a backend AI goal endpoint. Recent AI runs are already loaded into the backend prompt and summarized into `analysis.context.recentRunSummaries`, but the prompt only lists raw actions and the frontend command center only says that memory exists. It does not clearly hand unresolved action outcomes back to AI or show the user whether historical AI work still has open items.

# Analysis
`gateway/internal/http/handlers/ai_goal.go::writeRecentGoalRunMemory` writes recent runs and up to five actions, but it lacks a contract that tells AI how to use those actions. `summarizeRecentGoalRuns` only includes `ActionCount`, so the frontend cannot distinguish fully handled history from runs with manual, ready, or blocked handoff items. `client/data/ai-goal-preset.mjs::aiCommandCenterFromState` already renders an `ai_memory` evidence item, which is the right place to expose unresolved history without adding another panel.

# Proposed Solution
Add action status counting in the backend, use it both in prompt memory and in `aiGoalRecentRunSummary`, then display aggregate unresolved counts in the command center memory detail. The AI prompt should explicitly say that done actions are evidence, manual/ready/blocked actions are unresolved handoff items, and promotion to testnet/mainnet is forbidden while sentiment review or paper watch remains unresolved.

# Implementation Plan

### Task 1: Backend RED Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Extend prompt memory test**

In `TestBuildGoalPromptIncludesRecentAIGoalMemory`, add expected substrings:

```go
"Recent action handoff rules",
"done actions are evidence; do not ask the user to repeat them unless new contradictory data appears",
"manual, ready, or blocked actions are unresolved handoff items",
"run=goal_new actionHandoff unresolved=1 done=1 ready=0 manual=1 blocked=0",
"Do not promote to testnet or mainnet while sentiment_review or paper_watch is unresolved",
```

**Step 2: Extend summary test**

In `TestSummarizeGoalContextIncludesRecentRunMemory`, assert the second summary has:

```go
second.DoneActionCount == 1
second.ManualActionCount == 1
second.ReadyActionCount == 0
second.BlockedActionCount == 0
second.OpenActionCount == 1
```

**Step 3: Run RED**

Run:

```bash
cd gateway && GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestBuildGoalPromptIncludesRecentAIGoalMemory|TestSummarizeGoalContextIncludesRecentRunMemory'
```

Expected: FAIL because prompt handoff rules and summary count fields do not exist.

### Task 2: Frontend RED Test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Extend command center memory test**

In `aiCommandCenterFromState promotes a safe validated paper candidate`, add action status count fields to the second `recentRunSummaries` row:

```js
doneActionCount: 1,
manualActionCount: 1,
readyActionCount: 0,
blockedActionCount: 0,
openActionCount: 1,
```

Then assert:

```js
assert.ok(memory.detail.includes("未完成 1"));
```

**Step 2: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because memory detail does not include unresolved action counts.

### Task 3: Backend Implementation

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Extend summary struct**

Add fields to `aiGoalRecentRunSummary`:

```go
DoneActionCount    int `json:"doneActionCount"`
ReadyActionCount   int `json:"readyActionCount"`
ManualActionCount  int `json:"manualActionCount"`
BlockedActionCount int `json:"blockedActionCount"`
OpenActionCount    int `json:"openActionCount"`
```

**Step 2: Add action count helper**

Add:

```go
type aiGoalActionStatusCounts struct { ... }
func summarizeGoalActionStatuses(actions []mongostore.AIGoalRunAction) aiGoalActionStatusCounts
```

Rules:
- Count case-insensitive statuses.
- `done` increments done.
- `ready`, `manual`, and `blocked` increment their named count and open count.
- Unknown non-empty statuses increment open count, but do not increment the named counts.

**Step 3: Use helper in `summarizeRecentGoalRuns`**

Fill the new fields from `summarizeGoalActionStatuses(run.Actions)`.

**Step 4: Add prompt handoff rules**

Inside `writeRecentGoalRunMemory`, after the no-runs branch and before iterating runs, write:

```go
Recent action handoff rules:
- done actions are evidence; do not ask the user to repeat them unless new contradictory data appears.
- manual, ready, or blocked actions are unresolved handoff items; continue, unblock, or invalidate them explicitly.
- Do not promote to testnet or mainnet while sentiment_review or paper_watch is unresolved.
```

For each run, add a line:

```go
run=<id> actionHandoff unresolved=<open> done=<done> ready=<ready> manual=<manual> blocked=<blocked>
```

### Task 4: Frontend Implementation

**Files:**
- Modify: `client/data/type.d.ts`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend TypeScript summary type**

Add optional fields to `TypeAIGoalRecentRunSummary`:

```ts
doneActionCount?: number;
readyActionCount?: number;
manualActionCount?: number;
blockedActionCount?: number;
openActionCount?: number;
```

**Step 2: Add frontend aggregate helper**

In `client/data/ai-goal-preset.mjs`, add a small local helper near `aiCommandCenterFromState`:

```js
function recentRunOpenActionCount(summaries) { ... }
```

Rules:
- Sum `openActionCount` when numeric.
- Otherwise fall back to `manualActionCount + readyActionCount + blockedActionCount`.
- Ignore invalid or negative values.

**Step 3: Update memory detail**

In the `ai_memory` evidence detail, append `未完成 N 个交接动作` when the aggregate open count is greater than 0.

### Task 5: Verification

**Files:**
- No planned code changes.

Run:

```bash
cd gateway && GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestBuildGoalPromptIncludesRecentAIGoalMemory|TestSummarizeGoalContextIncludesRecentRunMemory'
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
rg -n "[[:blank:]]$" gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go client/data/type.d.ts client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-action-handoff-memory.md
```

Expected:
- Go target tests pass.
- Node tests pass.
- Typecheck passes.
- Lint exits 0; the known `client/data/use-activity-center.tsx:138` warning may remain.
- No trailing whitespace.

Implementation Checklist:
1. Extend Go prompt memory test with handoff rules and per-run action handoff expectations.
2. Extend Go summary test with action status count assertions.
3. Run the targeted Go tests and confirm RED.
4. Extend the frontend command center memory test with summary count fields and an unresolved-count assertion.
5. Run the Node test and confirm RED.
6. Add backend action status count fields and helper.
7. Write handoff rules and per-run action handoff counts into the backend prompt.
8. Add frontend summary count type fields.
9. Add frontend open-action aggregate helper and update command center memory detail.
10. Run all verification commands.
11. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 02:28 CST
    *   Step: 1. Extend Go prompt memory test with handoff rules and per-run action handoff expectations.
    *   Modifications: Added assertions in `TestBuildGoalPromptIncludesRecentAIGoalMemory` for action handoff rules, unresolved action treatment, and per-run handoff counts.
    *   Change Summary: Backend prompt tests now require AI to receive explicit continuation rules for prior run actions.
    *   Reason: Executing plan step 1.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:28 CST
    *   Step: 2. Extend Go summary test with action status count assertions.
    *   Modifications: Added assertions for `DoneActionCount`, `ManualActionCount`, `ReadyActionCount`, `BlockedActionCount`, and `OpenActionCount`.
    *   Change Summary: Backend summary tests now require action status counts for frontend observability.
    *   Reason: Executing plan step 2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:29 CST
    *   Step: 3. Run the targeted Go tests and confirm RED.
    *   Modifications: No file modifications.
    *   Change Summary: RED confirmed with compile failure because `aiGoalRecentRunSummary` did not yet expose the new action count fields.
    *   Reason: Executing plan step 3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:29 CST
    *   Step: 4. Extend the frontend command center memory test with summary count fields and an unresolved-count assertion.
    *   Modifications: Added action count fields to the command center test fixture and asserted the memory detail includes `未完成 1`.
    *   Change Summary: Frontend tests now require unresolved historical AI action handoff to be visible.
    *   Reason: Executing plan step 4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:29 CST
    *   Step: 5. Run the Node test and confirm RED.
    *   Modifications: No file modifications.
    *   Change Summary: RED confirmed because `memory.detail` did not include `未完成 1`.
    *   Reason: Executing plan step 5.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:30 CST
    *   Step: 6. Add backend action status count fields and helper.
    *   Modifications: Extended `aiGoalRecentRunSummary`, added `aiGoalActionStatusCounts`, added `summarizeGoalActionStatuses`, and populated counts in `summarizeRecentGoalRuns`.
    *   Change Summary: Backend summaries now expose done/ready/manual/blocked/open action counts.
    *   Reason: Executing plan step 6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:30 CST
    *   Step: 7. Write handoff rules and per-run action handoff counts into the backend prompt.
    *   Modifications: `writeRecentGoalRunMemory` now emits action handoff rules and a per-run `actionHandoff` count line.
    *   Change Summary: AI receives explicit instructions to treat done actions as evidence and unresolved actions as handoff items.
    *   Reason: Executing plan step 7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:31 CST
    *   Step: 8. Add frontend summary count type fields.
    *   Modifications: Added optional action count fields to `TypeAIGoalRecentRunSummary`.
    *   Change Summary: TypeScript accepts backend action status counts in AI recent run summaries.
    *   Reason: Executing plan step 8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:31 CST
    *   Step: 9. Add frontend open-action aggregate helper and update command center memory detail.
    *   Modifications: Added `nonNegativeCount`, `recentRunOpenActionCount`, and appended unresolved handoff copy to `ai_memory` evidence detail.
    *   Change Summary: The command center now shows when historical AI memory includes unresolved handoff actions.
    *   Reason: Executing plan step 9.
    *   Blockers: Minor deviation handled: the helper insertion anchor differed from the plan because `commandEvidenceItem` was not adjacent to `commandPrimaryAction`; helper placement was adjusted to the actual nearby command center helper block.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:32 CST
    *   Step: 10. Run all verification commands.
    *   Modifications: No file modifications.
    *   Change Summary: Verification passed: fresh targeted Go tests with `-count=1`, Node test 114/114, `yarn typecheck`, `yarn lint` with 0 errors and the known `use-activity-center.tsx:138` warning, `git diff --check`, and touched-file trailing whitespace scan.
    *   Reason: Executing plan step 10.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 02:33 CST
    *   Step: 11. Append task progress and final review to this plan document.
    *   Modifications: Updated this plan's Current Execution Step, Task Progress, and Final Review sections.
    *   Change Summary: Documented implementation evidence and compliance review.
    *   Reason: Executing plan step 11.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan, with one reported minor placement correction for the frontend helper anchor.

The backend now sends explicit action handoff rules to AI and includes per-run action status counts in both prompt memory and context summaries. The frontend type accepts those counts, and the AI command center memory evidence now shows unresolved historical handoff actions when present. No execution route, trading permission, order submission path, or safety gate was changed.

Verification evidence:
- RED Go: targeted tests failed because the new summary fields did not exist.
- RED Node: command center test failed because memory detail did not include `未完成 1`.
- GREEN Go: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run 'TestBuildGoalPromptIncludesRecentAIGoalMemory|TestSummarizeGoalContextIncludesRecentRunMemory' -count=1` passed.
- GREEN Node: `node --test client/data/ai-goal-preset.test.mjs` passed with 114/114 tests.
- `cd client && yarn typecheck` passed.
- `cd client && yarn lint` passed with 0 errors and the known warning in `client/data/use-activity-center.tsx:138`.
- `git diff --check` passed.
- `rg -n "[[:blank:]]$" gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go client/data/type.d.ts client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-action-handoff-memory.md` found no trailing whitespace.
