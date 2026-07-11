# AI Autopilot Primary Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Autopilot panel expose the next safe non-trading action directly.

**Architecture:** Extend the existing frontend-only `aiAutopilotStateFromAnalysis` helper to carry a `primaryAction` derived from `nextAIGoalDecision`. The UI renders that action in `AIAutopilotPanel` using existing callbacks only: daily scan / analyze+validate, batch backtest, accept paper candidate, or navigation links. It still never submits orders, approves wallets, or bypasses mainnet gates.

**Tech Stack:** Next.js client component, HeroUI buttons, Node built-in test runner.

---

# Context
Filename: 2026-06-02-ai-autopilot-primary-action.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让用户更容易从“AI 自动驾驶”面板直接推进下一步安全动作，而不是在多个面板之间寻找按钮。

# Analysis
`AI 自动驾驶` 面板目前展示阶段、进度、最高阶段、阻塞项、安全闸门和下一步，但没有按钮。机会雷达和今日任务已经有安全按钮，说明相关回调链路已存在。

`aiAutopilotStateFromAnalysis` 已能读取 `nextAIGoalDecision`，因此可以复用该决策的 `primaryAction`，并为只有 `primaryHref` 的阶段补成打开链接动作。

# Proposed Solution
给 `AIAutopilotState` 增加 `primaryAction`。无 active analysis 时显示“启动 AI 雷达”；有分析时复用 `nextAIGoalDecision.primaryAction`；如果只有 `primaryHref`，显示一个打开链接动作。页面只渲染安全动作，不新增交易执行入口。

# Implementation Plan
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败测试，覆盖 idle、backtest、sentiment_review、testnet_candidate 的 `primaryAction`。
2. 在 `client/data/ai-goal-preset.mjs` 实现 `autopilotPrimaryActionFromDecision` 或等价内联逻辑。
3. 在 `client/app/(dashboard)/ai-money/client.tsx` 扩展 `AIAutopilotState` 类型。
4. 修改 `AIAutopilotPanel` props，接入 `analysis`、`candidate`、busy 状态和现有安全回调。
5. 渲染主按钮：启动雷达、批量回测、采用 paper、打开链接。
6. 运行 helper 测试、typecheck、lint、build、diff check 和浏览器烟测。

Implementation Checklist:
1. Add failing tests for autopilot primary actions.
2. Run helper test and confirm RED.
3. Implement primary action helper output.
4. Render safe action button in Autopilot panel.
5. Run verification commands.

# Current Execution Step
> Currently executing: "5. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing tests for autopilot primary actions
    *   Modifications: Added tests requiring `aiAutopilotStateFromAnalysis.primaryAction`.
    *   Change Summary: Defined the desired safe Autopilot action behavior before implementation.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3-4. Implement and render Autopilot primary action
    *   Modifications: Added `primaryAction` / `primaryHref` to Autopilot state and rendered a safe button in `AIAutopilotPanel`.
    *   Change Summary: The Autopilot panel can now launch the next safe non-trading workflow step.
    *   Reason: Executing plan steps 3-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 48/48 pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `git diff --check` — pass
- `yarn build` — pass after rerun with network approval because Next.js needed to fetch Google Fonts
- Browser smoke for `http://localhost:3000/ai-money` — redirected to `/login?next=%2Fai-money` as expected in an unauthenticated session, with no browser error logs

No trading execution paths, order submission paths, wallet approval paths, or mainnet gates were changed.
