# Context
Filename: 2026-06-02-ai-auto-daily-radar.md
Created On: 2026-06-02
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让用户更容易观察和使用 AI。新增本地“自动雷达”能力：用户开启后，页面加载并发现今日雷达缺失或已经过期时，自动发起一次安全的今日扫描和验证；默认关闭，不触发真实交易。

# Project Overview
`finance_next` 是加密货币 / 期权策略管理工具。本次改动位于 `client/app/(dashboard)/ai-money/client.tsx` 与 `client/data/ai-goal-preset.mjs`，延续此前 AI 目标分析、今日雷达、批量回测验证和 paper 观察链路。

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
今日雷达已有三块基础能力：`dailyRadarFormStateFromRuns` 可以生成安全扫描目标，`dailyRadarStatusFromRuns` 可以判断今日扫描是否存在或过期，`AIGoalClient` 已有 `onDailyRadarScan` 可以执行“分析 + 验证”。缺失的是一个可控的自动入口和去重策略，避免每次渲染或每次打开页面重复扫描。

# Proposed Solution
使用 localStorage 保存用户是否开启“自动雷达”，默认关闭。新增纯函数 `autoDailyRadarDecision`，输入当前状态、busy 状态和上次触发 key，输出是否应该自动运行。前端只在开启、非忙碌、今日雷达缺失或过期时触发，并用 `YYYY-MM-DD:actionKind:runID` 做本地去重。

# Implementation Plan
Implementation Checklist:
1. 在 `client/data/ai-goal-preset.test.mjs` 先写自动触发决策测试，覆盖开启后只触发一次、关闭不触发、忙碌不触发、今日雷达新鲜不触发。
2. 在 `client/data/ai-goal-preset.mjs` 实现 `autoDailyRadarDecision`，只允许 `scan_today` 与 `rescan_today` 触发。
3. 在 `client/app/(dashboard)/ai-money/client.tsx` 增加本地自动雷达开关、localStorage 持久化、自动 effect 和 UI Switch。
4. 运行 JS 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。

# Current Execution Step
> Currently executing: "4. 运行 JS 单测、TypeScript、lint、diff check、生产构建和浏览器 smoke。"

# Task Progress
*   2026-06-02
    *   Step: 1-3. 自动今日雷达决策与 UI
    *   Modifications: 新增 `autoDailyRadarDecision`；新增相关 Node test；`AI Money` 页面新增“自动雷达”开关、本地持久化和自动触发逻辑。
    *   Change Summary: 用户开启后，页面可在今日雷达缺失或过期时自动发起一次安全扫描和回测验证。
    *   Reason: Executing plan step 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 37/37 pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `yarn build` — pass
- `git diff --check` — pass
- Browser smoke for `http://localhost:3000/ai-money` — redirected to `/login?next=%2Fai-money` as expected in an unauthenticated session, with no browser error logs
