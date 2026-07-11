# Context
Filename: 2026-06-02-ai-daily-mission.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让用户每天打开页面后能直接知道“现在该让 AI 做什么”。新增“今日 AI 任务”：从 AI 状态中生成 3-5 个当天任务，并把安全动作按钮放在任务旁。

# Project Overview
`finance_next` 已有 AI 目标分析、今日雷达、自动驾驶、复盘日志、批量回测验证和 paper 观察。本次改动继续提升易用性：把下一步动作从多个面板压缩到一张任务清单，降低用户理解成本。

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
机会雷达和自动驾驶面板已经说明当前阶段，但用户仍需要自己判断“先点哪个按钮”。现有安全动作包括今日扫描、批量回测、采用 paper 候选、打开相关页面；这些动作已经有风控边界，不会直接实盘交易。

# Proposed Solution
新增 `aiDailyMissionFromState`，从 `analysis`、`persistedActions`、`validationRuns`、`runs` 和 `dailyRadarStatus` 生成 mission object。页面新增 `今日 AI 任务` 面板，针对任务的 `actionKind` 渲染已有安全动作按钮：扫描、回测、采用 paper、打开链接。

# Implementation Plan
Implementation Checklist:
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败测试，覆盖无 active analysis 时今日扫描为首要任务，以及强回测后采用 paper 候选为首要任务。
2. 在 `client/data/ai-goal-preset.mjs` 实现 `aiDailyMissionFromState`。
3. 在 `client/app/(dashboard)/ai-money/client.tsx` 新增 `AIDailyMissionPanel`，接入现有安全动作回调。
4. 运行 JS 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。

# Current Execution Step
> Currently executing: "4. 运行 JS 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。"

# Task Progress
*   2026-06-02
    *   Step: 1-3. 今日 AI 任务
    *   Modifications: 新增 `aiDailyMissionFromState` 与 2 条测试；`AI Money` 页面新增 `今日 AI 任务` 面板和安全动作按钮。
    *   Change Summary: 用户能从一个任务清单直接执行今日扫描、批量回测、采用 paper 候选或打开相关页面。
    *   Reason: Executing plan step 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 43/43 pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `git diff --check` — pass
- `yarn build` — pass
- Browser smoke for `http://localhost:3000/ai-money` — redirected to `/login?next=%2Fai-money` as expected in an unauthenticated session, with no browser error logs
