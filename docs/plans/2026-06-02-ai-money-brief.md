# AI Money Brief Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-screen AI command brief that tells the user what the AI currently sees, how confident the workflow is, and the next safe action.

**Architecture:** Add a pure helper `aiMoneyBriefFromState` in `client/data/ai-goal-preset.mjs`. It composes existing decision, sentiment, validation, daily radar, and capital-plan helpers into one concise state object. The `/ai-money` client renders the brief above the detailed panels and routes its button to existing safe callbacks only.

**Tech Stack:** Next.js client component, HeroUI Button, existing AI Money helper module, Node built-in test runner.

---

# Context
Filename: 2026-06-02-ai-money-brief.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让用户更容易观察 AI 是否已找到赚钱路径、当前阻塞在哪里、下一步该做什么。

# Analysis
当前 `/ai-money` 已经有机会雷达、今日任务、风向/人性、资金计划、自动驾驶和复盘日志。问题是这些面板分散，用户需要自己综合判断。首屏缺一个明确的 AI 总控摘要。

# Proposed Solution
新增 `aiMoneyBriefFromState`：

- 无分析时：提示启动今日扫描或打开今日雷达。
- 今日雷达过期时：优先提示刷新市场、舆论、宏观、链上上下文。
- 有分析时：复用 `nextAIGoalDecision`、`aiSentimentCompassFromAnalysis`、`rankBacktestValidation`、`aiCapitalPlanFromState` 生成阶段、置信度、证据指标、检查点和安全主动作。
- UI 面板只复用已有动作：今日扫描、打开已有 run、批量回测、采用 paper 候选、打开链接。

# Implementation Plan
1. 在 `client/data/ai-goal-preset.test.mjs` 导入 `aiMoneyBriefFromState` 并添加失败断言。
2. 运行 `node --test client/data/ai-goal-preset.test.mjs`，确认 RED。
3. 在 `client/data/ai-goal-preset.mjs` 实现 `aiMoneyBriefFromState`。
4. 在 `client/app/(dashboard)/ai-money/client.tsx` 增加 `AIMoneyBriefState` 类型、build 调用和 `AIMoneyBriefPanel`。
5. 将 `AIMoneyBriefPanel` 放在右侧结果区顶部。
6. 运行 helper 测试、typecheck、lint、build、diff check 和浏览器烟测。

Implementation Checklist:
1. Write failing tests for idle, stale radar, and paper candidate brief states.
2. Run helper test and confirm RED.
3. Implement the brief helper.
4. Render the brief panel and wire safe actions.
5. Run verification commands.

# Current Execution Step
> Currently executing: "5. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Write failing tests for idle, stale radar, and paper candidate brief states
    *   Modifications: Added `aiMoneyBriefFromState` import and tests covering idle scan, stale context refresh, and paper candidate summary.
    *   Change Summary: Defined the command brief behavior before production implementation.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2. Run helper test and confirm RED
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`; confirmed failure because `aiMoneyBriefFromState` was not exported.
    *   Change Summary: Verified the new tests caught missing behavior.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3. Implement the brief helper
    *   Modifications: Added `aiMoneyBriefFromState`, confidence scoring, stale-context override, and summary metrics in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: AI Money now has a single derived state for command-summary display.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Render the brief panel and wire safe actions
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` with `AIMoneyBriefState`, brief builder call, and `AIMoneyBriefPanel`.
    *   Change Summary: `/ai-money` now shows the command brief above detailed panels and routes actions to existing safe callbacks.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Run verification commands
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, `git diff --check`, `yarn build`, and an in-app Browser smoke test for `/ai-money`.
    *   Change Summary: Confirmed helper behavior, UI typing, lint/build health, whitespace cleanliness, and local route behavior.
    *   Reason: Executing plan step 5
    *   Blockers: `yarn lint` still reports the existing unused eslint-disable warning in `client/data/use-activity-center.tsx:138`; no new lint errors. `yarn build` requires network access for Google Fonts and passed under the approved build rule.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan. The brief helper composes existing AI Money state into a single command summary, and the UI renders it through existing safe scan, navigation, validation, and paper-adoption callbacks. No real trading, live toggles, wallet approvals, or mainnet gates were changed.
