# AI Capital Plan Primary Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI capital plan panel directly expose the next safe workflow action.

**Architecture:** Extend `aiCapitalPlanFromState` with `primaryAction` derived from the capital-plan stage. The `/ai-money` panel renders only existing safe callbacks: batch backtest, accept paper candidate, or navigation. It does not submit orders, approve wallets, enable live trading, or bypass any mainnet gate.

**Tech Stack:** Frontend helper module, Next.js client component, HeroUI Button, Node built-in test runner.

---

# Context
Filename: 2026-06-02-ai-capital-plan-primary-action.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让资金计划面板不只是展示建议仓位，还能把用户带到下一步安全动作。

# Analysis
`aiCapitalPlanFromState` 已能输出等待验证、风向复核前、paper sizing 三种状态。`AICapitalPlanPanel` 当前只有预填策略链接，用户仍要到其它面板运行回测或采用 paper 候选。

# Proposed Solution
为资金计划状态新增 `primaryAction`：

- `waiting_validation` 且存在可回测草案时：`run_all_backtests`
- `review_before_sizing`：`open_link` 到舆情数据
- `paper_sizing`：`accept_paper_candidate`

页面根据 action 渲染按钮，复用已有 `runAllBacktests`、`acceptPaperCandidate` 和链接。

# Implementation Plan
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败断言，要求三种资金计划状态输出 `primaryAction`。
2. 在 `client/data/ai-goal-preset.mjs` 实现 primary action 派生。
3. 在 `client/app/(dashboard)/ai-money/client.tsx` 扩展 `AICapitalPlanState` 类型。
4. 修改 `AICapitalPlanPanel` props，接入 `analysis`、`candidate`、busy 状态和安全回调。
5. 渲染资金计划主按钮。
6. 运行 helper 测试、typecheck、lint、build、diff check 和浏览器烟测。

Implementation Checklist:
1. Add failing primaryAction tests.
2. Run helper test and confirm RED.
3. Implement capital plan primaryAction output.
4. Render safe button in capital plan panel.
5. Run verification commands.

# Current Execution Step
> Currently executing: "5. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing primaryAction tests
    *   Modifications: Added assertions for capital plan `primaryAction` in waiting, review, and paper sizing stages.
    *   Change Summary: Defined desired capital-plan action behavior before implementation.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 2. Run helper test and confirm RED
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`; confirmed three capital-plan tests failed only because `primaryAction` was undefined.
    *   Change Summary: Verified the new assertions caught the missing behavior.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3. Implement capital plan primaryAction output
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` to emit safe `primaryAction` values for validation, sentiment review, and paper sizing stages.
    *   Change Summary: Capital plan now tells the UI which safe next action is appropriate.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Render safe button in capital plan panel
    *   Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` to pass analysis/candidate/busy props into `AICapitalPlanPanel` and render batch-backtest, open-link, or accept-paper buttons.
    *   Change Summary: The AI capital plan panel can now drive the same safe workflow actions as the radar/autopilot panels.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 5. Run verification commands
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, `git diff --check`, `yarn build`, and an in-app Browser smoke test for `/ai-money`.
    *   Change Summary: Confirmed helper behavior, TypeScript wiring, lint/build health, whitespace cleanliness, and local route behavior after implementation.
    *   Reason: Executing plan step 5
    *   Blockers: The first sandboxed `yarn build` failed because Google Fonts could not be fetched without network access; rerun with approved network access passed. Browser screenshot capture timed out, but URL/DOM/console smoke checks passed.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan. The capital-plan helper now emits only safe workflow actions, and the `/ai-money` panel renders those actions through existing validation, navigation, and paper-adoption callbacks. No real trading, live toggles, wallet approvals, or mainnet gates were changed.
