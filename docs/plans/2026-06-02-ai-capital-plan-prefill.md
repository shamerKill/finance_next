# AI Capital Plan Prefill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Carry the AI capital plan’s recommended paper size into the strategy prefill URL.

**Architecture:** Reuse `strategyPresetSearchFromDraft`. When `aiCapitalPlanFromState` computes `recommendedNotionalUsd`, build `primaryHref` from the candidate draft with `params.orderGroupMargin` overridden to that recommendation. Keep `riskCaps` intact so `/option` still receives the AI risk caps.

**Tech Stack:** Frontend helper module, Node built-in test runner, existing `/option` preset parsing.

---

# Context
Filename: 2026-06-02-ai-capital-plan-prefill.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
让 AI 资金计划不仅展示建议仓位，还能把建议仓位带入策略创建表单，减少用户手动抄数。

# Analysis
`aiCapitalPlanFromState` 当前计算 `recommendedNotionalUsd`，但 `primaryHref` 使用候选原始 `strategyHref`。如果 AI 草案里的 `orderGroupMargin` 与资金计划不一致，用户打开 `/option` 后看到的保证金不是资金计划推荐值。

# Proposed Solution
当资金计划进入 `paper_sizing` 时，用 candidate draft 生成新的 `/option` preset URL，并把 `params.orderGroupMargin` 覆盖为 `recommendedNotionalUsd`。不改变后端，不新增交易动作。

# Implementation Plan
1. 在 `client/data/ai-goal-preset.test.mjs` 更新资金计划测试，要求 `primaryHref` 查询参数包含 `orderGroupMargin=200` 和原始 risk caps。
2. 运行 helper 测试确认 RED。
3. 在 `client/data/ai-goal-preset.mjs` 新增或内联 capital-plan preset href 生成逻辑。
4. 运行 helper 测试、typecheck、lint、build、diff check 和浏览器烟测。

Implementation Checklist:
1. Add failing primaryHref assertions.
2. Run helper test and confirm RED.
3. Implement orderGroupMargin override in capital plan href.
4. Run verification commands.

# Current Execution Step
> Currently executing: "4. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing primaryHref assertions
    *   Modifications: Updated capital plan test to require strategy prefill orderGroupMargin from the AI capital plan.
    *   Change Summary: Defined expected bridge between capital plan sizing and `/option` preset URL.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3. Implement orderGroupMargin override in capital plan href
    *   Modifications: Added `capitalPlanStrategyHref` and used it for `paper_sizing.primaryHref`.
    *   Change Summary: Opening the capital plan strategy now carries the recommended paper notional into `/option` as `orderGroupMargin`.
    *   Reason: Executing plan step 3
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
