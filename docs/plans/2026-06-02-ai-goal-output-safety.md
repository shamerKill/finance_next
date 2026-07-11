# AI Goal Output Safety Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure AI-generated strategy blueprints are normalized into safe, risk-capped, validation-first output before the frontend can use them.

**Architecture:** Harden `parseGoalAIResponse` defaults in `gateway/internal/http/handlers/ai_goal.go`. The AI provider may return aggressive execution fields or incomplete drafts; the gateway should clamp execution to the requested mode, force `canAutoExecute=false`, add safety gates, and fill missing risk caps / validation plan / execution plan on each draft.

**Tech Stack:** Go handler parser tests, existing AI goal response parser.

---

# Context
Filename: 2026-06-02-ai-goal-output-safety.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI 自动分析生成策略能力，确保模型输出即使过激或缺字段，也会被后端归一化为安全、可回测、带风控的策略草案。

# Analysis
`fillGoalAnalysisDefaults` 当前会强制 `CanAutoExecute=false` 并补执行步骤，但它不会把 provider 返回的 `mainnet` 降级到用户请求的较低执行模式，也不会保证每个 strategy draft 有 risk caps、validation plan、execution plan 和 blockers。这会降低一键预填策略的安全性和稳定性。

# Proposed Solution
新增测试覆盖 provider 返回：

- `execution.mode="mainnet"`，但用户请求 `paper`
- `execution.canAutoExecute=true`
- 草案缺少 `riskCaps`、`validationPlan`、`executionPlan`、`blockers`

期望后端输出：

- `execution.mode` 降级回 `paper`
- `canAutoExecute=false`
- 安全闸门包含 risk caps / backtest / mainnet token gate
- 草案自动补 risk caps 和验证/执行/阻塞计划

# Implementation Plan
1. 在 `gateway/internal/http/handlers/ai_goal_test.go` 新增失败测试 `TestParseGoalAIResponseNormalizesUnsafeProviderOutput`。
2. 运行 targeted Go test，确认 RED。
3. 在 `gateway/internal/http/handlers/ai_goal.go` 增加执行模式和策略草案归一化 helpers。
4. 在 `fillGoalAnalysisDefaults` 中调用归一化逻辑。
5. 运行 targeted test、handler tests、`go test ./...`、前端 helper tests 和 typecheck。

Implementation Checklist:
1. Write failing parser safety test.
2. Run targeted test and confirm RED.
3. Implement execution mode and draft safety normalization.
4. Run verification commands.

# Current Execution Step
> Currently executing: "4. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Write failing parser safety test
    *   Modifications: Added `TestParseGoalAIResponseNormalizesUnsafeProviderOutput` in `gateway/internal/http/handlers/ai_goal_test.go`.
    *   Change Summary: Defined expected backend behavior for unsafe provider output.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2. Run targeted test and confirm RED
    *   Modifications: Ran `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestParseGoalAIResponseNormalizesUnsafeProviderOutput -count=1`; it failed because provider `mainnet` was not downgraded.
    *   Change Summary: Confirmed parser normalization gap.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3. Implement execution mode and draft safety normalization
    *   Modifications: Added `safeGoalExecutionMode`, `ensureGoalSafetyGates`, and `normalizeGoalStrategyDrafts`; wired them into `fillGoalAnalysisDefaults`.
    *   Change Summary: Backend now downgrades over-aggressive execution output and fills draft risk/validation fields.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Run verification commands
    *   Modifications: Ran targeted parser test, handler package tests, `go test ./...`, frontend helper tests, `yarn typecheck`, and `gofmt`.
    *   Change Summary: Confirmed backend parser hardening and frontend compatibility.
    *   Reason: Executing plan step 4
    *   Blockers: Full `go test ./...` requires non-sandbox local port access for httptest and passed under approved escalation.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan. AI provider output is now normalized at the gateway boundary: over-aggressive execution modes are capped to the requested mode, auto execution is disabled, safety gates are guaranteed, and strategy drafts receive risk caps plus validation/execution/blocker plans when missing. No real trading, live toggle, wallet approval, or mainnet bypass behavior was added.
