# AI Capital Plan Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI capital plan that turns a validated paper candidate into conservative paper sizing guidance.

**Architecture:** Add a frontend-only helper `aiCapitalPlanFromState` in `client/data/ai-goal-preset.mjs`. It consumes the active AI analysis, paper candidate, persisted action states, risk caps, backtest drawdown, and sentiment stage. The `/ai-money` page renders it as a read-only panel with sizing, daily loss cap, rules, and next actions. It never submits orders or enables live trading.

**Tech Stack:** Next.js client component, existing helper module, Node built-in test runner.

---

# Context
Filename: 2026-06-02-ai-capital-plan.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让用户不仅看到 AI 推荐哪个策略，还能看到“先用多少 paper 仓位观察、最大日亏损多少、为什么要降仓”。

# Analysis
当前 AI Money 已有 strategy draft riskCaps、回测评分、paper candidate、风向/人性复核和 paper 观察计划。缺口是资金层：用户看到候选后仍要自己决定 paper 仓位和日亏损上限。

# Proposed Solution
新增 `aiCapitalPlanFromState`。没有候选时输出等待验证；候选存在但风向复核未完成且情绪非 balanced 时输出 `review_before_sizing`，推荐仓位为 0；复核完成后，根据 `riskCaps.maxPositionUsd`、score、回测最大回撤和风向折扣计算 paper sizing。页面新增“AI 资金计划”面板。

# Implementation Plan
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败测试，覆盖等待候选、风向复核前不 sizing、复核后输出 paper 仓位。
2. 在 `client/data/ai-goal-preset.mjs` 实现 `aiCapitalPlanFromState`。
3. 在 `client/app/(dashboard)/ai-money/client.tsx` 新增 `AICapitalPlanState` 类型和 `AICapitalPlanPanel`。
4. 将面板接入 `/ai-money` 右侧结果区，放在自动驾驶和风向面板附近。
5. 运行 helper 测试、typecheck、lint、build、diff check 和浏览器烟测。

Implementation Checklist:
1. Add failing capital plan tests.
2. Run helper test and confirm RED.
3. Implement capital plan helper.
4. Render capital plan panel.
5. Run verification commands.

# Current Execution Step
> Currently executing: "5. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing capital plan tests
    *   Modifications: Added tests requiring `aiCapitalPlanFromState`.
    *   Change Summary: Defined waiting, review-blocked, and paper-sizing capital plan behavior before production implementation.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2-4. Implement and render AI capital plan
    *   Modifications: Added `aiCapitalPlanFromState` and `AICapitalPlanPanel`.
    *   Change Summary: AI Money now shows conservative paper sizing, daily loss cap, risk discount, rules, and next actions.
    *   Reason: Executing plan steps 2-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 51/51 pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `git diff --check` — pass
- `yarn build` — pass after rerun with network approval because Next.js needed to fetch Google Fonts
- Browser smoke for `http://localhost:3000/ai-money` — redirected to `/login?next=%2Fai-money` as expected in an unauthenticated session, with no browser error logs

No trading execution paths, order submission paths, wallet approval paths, or mainnet gates were changed.
