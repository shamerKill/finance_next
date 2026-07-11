# AI Prompt Paper Handoff Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the backend AI prompt preserves unresolved paper-watch and sentiment-review handoff details, including stop rules and human / sentiment triggers.

**Architecture:** Keep the existing recent action memory lines for all actions, but add a longer bounded `handoffDetail` line for unresolved `paper_watch` and `sentiment_review` actions. This avoids expanding every action note while preserving the AI-critical observation handoff.

**Tech Stack:** Go Echo handler prompt builder, `go test`, existing `mongostore.AIGoalRunAction` memory.

# Context
Filename: `docs/plans/2026-06-03-ai-prompt-paper-handoff-memory.md`
Created On: 2026-06-03 03:14:00 CST
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
Continue optimizing the project toward goal-driven AI usage: paper observation handoffs should be remembered by future AI scans so AI can continue watching market, sentiment, and human behavior conditions instead of losing them to prompt truncation.

# Project Overview
Frontend now writes a rich `paper_watch` note containing observation window, metrics, stop rule, and first trigger. Backend prompt memory still prints all action notes with `compactGoalPromptText(..., 120)`, which can cut off the stop rule and trigger before the AI sees them.

# Analysis
`writeRecentGoalRunMemory` already distinguishes action statuses and recent run handoff counts. We can preserve important unresolved handoffs by writing an additional line only for manual/ready/blocked `paper_watch` or `sentiment_review`. This keeps prompt size bounded and focused.

# Proposed Solution
Add a small helper:

- `isUnresolvedGoalAction(status string) bool`
- `isDetailedGoalHandoffAction(id string) bool`

In `writeRecentGoalRunMemory`, after the short `action=... note=...` line, emit:

```text
  handoffDetail=<actionId> status=<status> related=<relatedId> detail=<note up to 360 chars>
```

only when the action is unresolved and the action id is `paper_watch` or `sentiment_review`.

# Implementation Plan

### Task 1: Backend RED Test

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Expand prompt memory fixture**

In `TestBuildGoalPromptIncludesRecentAIGoalMemory`, replace the `paper_watch` note with a rich note:

```go
Note: "AI paper 观察计划：btca，评分 82，关联回测 run_btc。窗口：24-72 小时。指标：收益 18.00%，回撤 8.00%，夏普 1.35。停止规则：paper 期间最大回撤超过 12.00% 时暂停观察并回到策略蓝图。首个触发器：社媒 FOMO -> 降低 paper 仓位。"
```

**Step 2: Add prompt assertions**

Assert the prompt includes:

- `handoffDetail=paper_watch status=manual related=btca`
- `停止规则：paper 期间最大回撤超过 12.00%`
- `首个触发器：社媒 FOMO -> 降低 paper 仓位`

**Step 3: Run RED**

Run:

```bash
cd gateway && go test ./internal/http/handlers -run TestBuildGoalPromptIncludesRecentAIGoalMemory -count=1
```

Expected: FAIL because `handoffDetail` does not exist.

### Task 2: Backend Implementation

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Add helpers**

Add near `summarizeGoalActionStatuses`:

```go
func isUnresolvedGoalAction(status string) bool
func isDetailedGoalHandoffAction(id string) bool
```

**Step 2: Emit handoff detail**

In `writeRecentGoalRunMemory`, after the existing action line, if the action qualifies, emit the extra `handoffDetail` line using `compactGoalPromptText(action.Note, 360)`.

**Step 3: Run GREEN**

Run:

```bash
cd gateway && go test ./internal/http/handlers -run TestBuildGoalPromptIncludesRecentAIGoalMemory -count=1
```

Expected: PASS.

### Task 3: Verification

Run:

```bash
cd gateway && go test ./internal/http/handlers -count=1
git diff --check
rg -n "[[:blank:]]$" gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go docs/plans/2026-06-03-ai-prompt-paper-handoff-memory.md
```

Expected:
- Target and package tests pass.
- Diff check passes.
- No trailing whitespace matches.

Implementation Checklist:
1. Replace the test paper-watch note with a rich AI paper handoff note.
2. Add RED assertions for `handoffDetail`, stop rule, and trigger.
3. Run target Go test and confirm RED.
4. Add unresolved / detailed handoff helper functions.
5. Emit `handoffDetail` lines for unresolved `paper_watch` / `sentiment_review`.
6. Run target Go test and confirm GREEN.
7. Run package and cleanliness verification.
8. Append task progress and final review to this plan document.

# Current Execution Step
> Currently executing: "Completed"

# Task Progress
*   2026-06-03 03:12:49 CST
    *   Step: 1-3. Expand backend prompt memory test and run RED.
    *   Modifications: Updated `gateway/internal/http/handlers/ai_goal_test.go` with a rich `paper_watch` action note and assertions for `handoffDetail`, the paper stop rule, and the first sentiment / human trigger.
    *   Change Summary: Confirmed RED because the existing prompt only printed the short 120-character action note and truncated before the stop rule / trigger.
    *   Reason: Executing implementation checklist steps 1-3.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:12:49 CST
    *   Step: 4-6. Implement detailed unresolved handoff prompt memory and run GREEN.
    *   Modifications: Added `isUnresolvedGoalAction` and `isDetailedGoalHandoffAction`; `writeRecentGoalRunMemory` now emits bounded `handoffDetail` lines for unresolved `paper_watch` and `sentiment_review` actions.
    *   Change Summary: Future AI prompts can now see the full paper observation handoff, including the stop rule and first human / sentiment trigger.
    *   Reason: Executing implementation checklist steps 4-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 03:12:49 CST
    *   Step: 7. Run package and cleanliness verification.
    *   Modifications: No code changes.
    *   Change Summary: `go test ./internal/http/handlers -run TestBuildGoalPromptIncludesRecentAIGoalMemory -count=1` passed; `go test ./internal/http/handlers -count=1` passed; `git diff --check` passed; trailing whitespace scan found no matches.
    *   Reason: Executing implementation checklist step 7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The RED/GREEN cycle proves the prompt previously lost the detailed paper observation handoff and now preserves it through a focused `handoffDetail` line. The change is bounded to unresolved `paper_watch` and `sentiment_review` actions, so it improves AI continuity without expanding every historical action note. No unreported deviations were detected.
