# AI Goal Operator Constraint Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure AI goal analysis always surfaces operator behavior constraints, market narrative focus, and avoid scenarios in the visible plan even when the provider returns sparse but valid JSON.

**Architecture:** Keep the AI provider contract unchanged and add deterministic post-processing in `fillGoalAnalysisDefaults`. The request-level operator constraints remain the source of truth, and parsed AI output is enriched only where required for safety and observability.

**Tech Stack:** Go 1.23+, Echo handler helpers, existing `go test` unit tests.

### Task 1: Add Failing Coverage for Parsed Provider Output

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Add a test for behavior and narrative backfill**

Add a unit test near `TestParseGoalAIResponseCarriesOperatorConstraints` that builds an `aiGoalAnalyzeRequest` with:
- `BehaviorConstraints`: `避免 FOMO 追涨`, `连续亏损后暂停`
- `MarketNarrativeFocus`: `ETF 资金流`, `社媒拥挤度`
- `AvoidScenarios`: `高杠杆`, `主网自动下单`

The provider JSON should contain a valid summary and strategy draft, but use an empty `humanFactors`, empty `watchSignals`, and sparse strategy safety fields.

Assert that parsed output:
- includes both behavior constraints in `HumanFactors`
- includes both market narrative focus values as `WatchSignals`
- includes both avoid scenarios in `Execution.SafetyGates`
- includes both avoid scenarios in the first strategy draft `Blockers`
- keeps `Context.OperatorConstraints` intact

**Step 2: Run the specific test and confirm RED**

Run:

`go test ./gateway/internal/http/handlers -run TestParseGoalAIResponseBackfillsOperatorConstraintsIntoVisiblePlan -count=1`

Expected: FAIL because provider output currently carries operator constraints only in `Context`, not visible plan fields.

### Task 2: Implement Minimal Constraint Backfill

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Add deterministic post-processing**

In `fillGoalAnalysisDefaults`, after nil/default initialization and before execution context gates:
- append request `BehaviorConstraints` to `out.HumanFactors`
- append request `MarketNarrativeFocus` into `out.WatchSignals` using source `human`, a conservative interpretation, and an action that treats each focus as review evidence rather than an order trigger
- append request `AvoidScenarios` into `out.Execution.SafetyGates` using the existing `禁止场景：...` wording
- append request `AvoidScenarios` into every strategy draft `Blockers` using the same wording

Use existing dedupe helper `appendUniqueTrimmed` where possible. Keep the change local to AI goal analysis helpers.

**Step 2: Run the RED test and confirm GREEN**

Run:

`go test ./gateway/internal/http/handlers -run TestParseGoalAIResponseBackfillsOperatorConstraintsIntoVisiblePlan -count=1`

Expected: PASS.

### Task 3: Regression Verification

**Files:**
- Verify only.

**Step 1: Run all AI goal handler tests**

Run:

`go test ./gateway/internal/http/handlers -run AIGoal -count=1`

Expected: PASS.

**Step 2: Run gateway handler package tests**

Run:

`go test ./gateway/internal/http/handlers -count=1`

Expected: PASS, or if sandbox blocks local networking, rerun with approval.

**Step 3: Check patch hygiene**

Run:

`git diff --check`

Expected: no output.

Implementation Checklist:
1. Add `TestParseGoalAIResponseBackfillsOperatorConstraintsIntoVisiblePlan` to `gateway/internal/http/handlers/ai_goal_test.go`.
2. Run the new focused test and confirm it fails for missing visible operator constraint backfill.
3. Update `fillGoalAnalysisDefaults` in `gateway/internal/http/handlers/ai_goal.go` to backfill behavior constraints, market narrative focus, and avoid scenarios into visible analysis fields.
4. Run the focused test and confirm it passes.
5. Run AI goal handler regression tests.
6. Run handler package tests.
7. Run `git diff --check`.

# Current Execution Step
> Currently executing: "Final review"

# Task Progress
*   2026-06-03 09:53:06 CST
    *   Step: 1. Add `TestParseGoalAIResponseBackfillsOperatorConstraintsIntoVisiblePlan` to `gateway/internal/http/handlers/ai_goal_test.go`.
    *   Modifications: Added a focused provider-output parsing test that asserts behavior constraints, market narrative focus, and avoid scenarios are visible in final analysis fields.
    *   Change Summary: The test now captures the missing visible operator-constraint backfill behavior.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:54:09 CST
    *   Step: 2. Run the new focused test and confirm it fails for missing visible operator constraint backfill.
    *   Modifications: Re-ran the focused Go test with `GOCACHE` pointed at `.tmp/go-cache` after the default user cache path was blocked by sandbox permissions.
    *   Change Summary: RED confirmed. The test fails because parsed provider output leaves `HumanFactors` empty instead of surfacing operator behavior constraints.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:54:49 CST
    *   Step: 3. Update `fillGoalAnalysisDefaults` in `gateway/internal/http/handlers/ai_goal.go` to backfill behavior constraints, market narrative focus, and avoid scenarios into visible analysis fields.
    *   Modifications: Added `backfillGoalOperatorConstraints` and `appendUniqueGoalWatchSignals`; wired post-processing into `fillGoalAnalysisDefaults`.
    *   Change Summary: Parsed AI output now visibly carries operator behavior constraints, market narrative watch signals, and avoid-scenario gates/blockers.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:55:23 CST
    *   Step: 4. Run the focused test and confirm it passes.
    *   Modifications: Verified the focused Go test using `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-cache`.
    *   Change Summary: GREEN confirmed for visible operator constraint backfill.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:55:46 CST
    *   Step: 5. Run AI goal handler regression tests.
    *   Modifications: Ran `go test ./gateway/internal/http/handlers -run AIGoal -count=1` with workspace-local `GOCACHE`.
    *   Change Summary: AI goal handler regression tests passed.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:56:14 CST
    *   Step: 6. Run handler package tests.
    *   Modifications: Ran `go test ./gateway/internal/http/handlers -count=1` with workspace-local `GOCACHE`.
    *   Change Summary: Handler package tests passed.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:56:57 CST
    *   Step: 7. Run `git diff --check`.
    *   Modifications: Ran `gofmt` on modified Go files, reran handler package tests, and reran `git diff --check`.
    *   Change Summary: Formatting, tests, and patch hygiene checks passed.
    *   Reason: Executing plan step 7
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
2026-06-03 09:57:33 CST

Implementation perfectly matches the final plan.

The new parser test covers sparse provider output and proves operator constraints are visible in `HumanFactors`, `WatchSignals`, `Execution.SafetyGates`, strategy `Blockers`, and `Context.OperatorConstraints`. The production change is limited to deterministic post-processing inside AI goal analysis defaults. It does not change provider request shape, account permissions, execution-mode caps, or mainnet/testnet gates.

Verification completed:
- `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-cache go test ./gateway/internal/http/handlers -run TestParseGoalAIResponseBackfillsOperatorConstraintsIntoVisiblePlan -count=1`
- `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-cache go test ./gateway/internal/http/handlers -run AIGoal -count=1`
- `GOCACHE=/Volumes/lin/code/my/finance_next/.tmp/go-cache go test ./gateway/internal/http/handlers -count=1`
- `gofmt -w gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go`
- `git diff --check`
