# Context
Filename: 2026-06-02-ai-autopilot-panel.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让用户更容易从“给一个赚钱目标”进入 AI 自动分析、策略生成、安全验证和执行观察。新增“AI 自动驾驶”状态面板，把 AI 当前阶段、可推进的最高执行层级、人性/舆论风险、安全闸门和下一步动作集中展示。

# Project Overview
`finance_next` 已有 AI 目标分析、今日雷达、批量回测验证、paper 候选和观察计划。本次改动不新增真实交易能力，而是提升观察与决策可读性：用户能一眼看到 AI 参与度和自动执行被哪些门槛限制。

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
后端 `gateway/internal/http/handlers/ai_goal.go` 已要求 AI 分析市场情绪、人性因素、宏观、链上和执行约束。前端 `AI Money` 页面已有机会雷达、行动队列、回测评分和 paper 观察计划，但缺少一个把这些信息综合为“当前自动驾驶阶段”的状态视图。

# Proposed Solution
新增前端纯函数 `aiAutopilotStateFromAnalysis`，复用 `nextAIGoalDecision`、回测评分、上下文缺口、人性因素和安全闸门，输出面板可直接渲染的状态对象。状态对象始终把 `canAutoExecute` 置为 false，防止 UI 暗示可直接主网自动交易；即使 AI 请求 mainnet，最高阶段也只推进到 testnet candidate。

# Implementation Plan
Implementation Checklist:
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败测试，覆盖上下文缺口阻塞执行、强回测且 paper 完成时只推进到测试网候选。
2. 在 `client/data/ai-goal-preset.mjs` 实现 `aiAutopilotStateFromAnalysis`。
3. 在 `client/app/(dashboard)/ai-money/client.tsx` 增加 `AIAutopilotPanel`，展示阶段、推进度、最高阶段、上下文/验证/观察指标、阻塞项、安全闸门和下一步。
4. 运行 JS 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。

# Current Execution Step
> Currently executing: "4. 运行 JS 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。"

# Task Progress
*   2026-06-02
    *   Step: 1-3. 自动驾驶状态与面板
    *   Modifications: 新增 `aiAutopilotStateFromAnalysis` 与 2 条测试；`AI Money` 页面新增 `AI 自动驾驶` 面板。
    *   Change Summary: 用户可以更容易看到 AI 当前阶段、阻塞原因、人性/舆论检查、安全闸门和下一步。
    *   Reason: Executing plan step 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 39/39 pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `git diff --check` — pass
- `yarn build` — pass
- Browser smoke for `http://localhost:3000/ai-money` — redirected to `/login?next=%2Fai-money` as expected in an unauthenticated session, with no browser error logs
