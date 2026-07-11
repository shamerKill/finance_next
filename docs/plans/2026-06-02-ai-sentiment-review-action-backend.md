# AI Sentiment Review Action Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Money UI persist the "风向 / 人性复核" checklist action without backend rejection.

**Architecture:** The frontend action queue emits `sentiment_review` when AI detects heated/fearful/data-gap sentiment. The backend action patch allowlist must include the same id so the user can mark the review done and continue the safe paper workflow. This only changes checklist persistence; it does not enable live trading.

**Tech Stack:** Go Echo handler normalization tests, existing AI goal run action patch normalization.

---

# Context
Filename: 2026-06-02-ai-sentiment-review-action-backend.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money，让用户可以完成风向 / 人性复核，不被后端动作 allowlist 拦截。

# Analysis
`client/data/ai-goal-preset.mjs` 和 `/ai-money` UI 已经使用 `sentiment_review` action。`gateway/internal/http/handlers/ai_goal.go::validAIGoalActionID` 当前只放行 `review`、`data`、`backtest`、`strategy`、`paper_watch`、`gate`，导致 PATCH `/ai/goals/runs/:id/actions/sentiment_review` 会返回 400。

# Proposed Solution
用失败测试复现 `normalizeAIGoalRunActionPatch("sentiment_review", ...)` 当前被拒绝，然后将 `sentiment_review` 加入后端 action id allowlist。

# Implementation Plan
1. 在 `gateway/internal/http/handlers/ai_goal_test.go` 新增 `TestAIGoalRunActionPatchAllowsSentimentReview`。
2. 运行 targeted Go test，确认 RED。
3. 在 `gateway/internal/http/handlers/ai_goal.go` 的 `validAIGoalActionID` 加入 `sentiment_review`。
4. 运行 gateway handler tests、Go test、前端 helper tests 和 typecheck。

Implementation Checklist:
1. Write failing backend action normalization test.
2. Run targeted test and confirm RED.
3. Add `sentiment_review` to backend allowlist.
4. Run verification commands.

# Current Execution Step
> Currently executing: "4. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Write failing backend action normalization test
    *   Modifications: Added `TestAIGoalRunActionPatchAllowsSentimentReview` in `gateway/internal/http/handlers/ai_goal_test.go`.
    *   Change Summary: Captured the expected ability to persist the `sentiment_review` checklist action.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2. Run targeted test and confirm RED
    *   Modifications: Ran `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestAIGoalRunActionPatchAllowsSentimentReview -count=1`; it failed with `invalid action id`.
    *   Change Summary: Confirmed the backend allowlist was the root cause.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3. Add `sentiment_review` to backend allowlist
    *   Modifications: Updated `gateway/internal/http/handlers/ai_goal.go::validAIGoalActionID`.
    *   Change Summary: Backend now accepts the same sentiment review action id emitted by the frontend AI Money workflow.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Run verification commands
    *   Modifications: Ran targeted handler test, handler package tests, `go test ./...`, frontend helper tests, `yarn typecheck`, and `gofmt`.
    *   Change Summary: Confirmed the fix works across backend and frontend workflow tests.
    *   Reason: Executing plan step 4
    *   Blockers: Sandboxed `go test ./...` could not open local httptest ports; rerun outside sandbox with approval passed.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan. The backend action allowlist now includes `sentiment_review`, allowing the existing AI Money sentiment/human-review gate to be persisted without enabling any trading, live toggle, wallet approval, or mainnet bypass.
