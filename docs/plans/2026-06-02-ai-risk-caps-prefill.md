# Context
Filename: 2026-06-02-ai-risk-caps-prefill.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化项目，让 AI 生成策略后更容易安全落地。把 AI 草案中的 `riskCaps` 接入策略预填和创建链路，使 AI 输出的最大仓位、最大杠杆、日亏损上限可以随策略一起保存。

# Project Overview
`finance_next` 的 `Option` 持久化模型已有 `risk` 字段，策略详情页和 order engine 也依赖该字段。但创建 DTO 和新建策略表单此前没有提交 `risk`，导致 AI 预填策略创建后缺少执行风控上限。

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
`client/app/(dashboard)/ai-money/client.tsx` 已在草案中展示 `riskCaps`，但只是 JSON。`strategyPresetFromDraft` 和 `parseStrategyPreset` 未编码/读取 risk，上游 `/option` 表单也没有风控字段。后端 `domain.CreateOptionDTO` 没有 `Risk` 字段，`OptionHandler.create` 没有保存 risk。

# Proposed Solution
前端在 AI 策略预填 URL 中携带 `riskMaxPositionUsd`、`riskMaxLeverage`、`riskDailyLossCapUsd`，`parseStrategyPreset` 解析为 `risk`。新建策略表单新增“风控上限”字段，并在三项均大于 0 时提交 `risk`。后端 `CreateOptionDTO` 接收可选 `Risk *RiskCaps`，创建时写入 `Option.Risk`。

# Implementation Plan
Implementation Checklist:
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败测试，要求 AI draft riskCaps 能被 `strategyPresetSearchFromDraft` 编码并被 `parseStrategyPreset` 解析。
2. 在 `gateway/internal/domain/option_test.go` 写失败测试，要求 `CreateOptionDTO` 接受有效 risk caps 并拒绝无效 risk caps。
3. 在 `client/data/ai-goal-preset.mjs` 实现 risk caps 编码/解析。
4. 在 `client/app/(dashboard)/option/page.tsx` 新增风控上限字段并提交 `risk`。
5. 在 `gateway/internal/domain/option.go` 和 `gateway/internal/http/handlers/option.go` 接收并保存 risk。
6. 运行 JS 单测、Go 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。

# Current Execution Step
> Currently executing: "6. 运行 JS 单测、Go 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。"

# Task Progress
*   2026-06-02
    *   Step: 1-5. AI riskCaps 预填与创建保存
    *   Modifications: 新增 risk caps 前端解析测试；新增 CreateOptionDTO risk 校验测试；策略预填 URL、创建表单和后端 DTO/handler 均接入 risk。
    *   Change Summary: AI 蓝图中的资金和风控上限可以随策略创建保存，后续 live/testnet 下单不再天然缺少 risk caps。
    *   Reason: Executing plan step 1-5
    *   Blockers: None
    *   User Confirmation Status: Pending

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 43/43 pass
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/domain ./internal/http/handlers` — pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `git diff --check` — pass
- `yarn build` — pass
- Browser smoke for `/option?source=ai-goal&...risk...` — redirected to `/login?next=%2Foption` as expected in an unauthenticated session, with no browser error logs
