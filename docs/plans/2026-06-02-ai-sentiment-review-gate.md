# AI Sentiment Review Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI-identified sentiment and human-bias risk affect the AI Money execution path before paper adoption.

**Architecture:** Reuse the frontend-only AI state helpers. `aiSentimentCompassFromAnalysis` classifies heated / fearful / data-gap states. `nextAIGoalDecision` and `actionPlanFromAnalysis` will require a persisted `sentiment_review` action before paper adoption when the compass is not balanced. The UI already supports manual action transitions, so the new action can use the existing `updateAIGoalRunAction` path.

**Tech Stack:** Next.js client component, Node built-in test runner, existing AI goal run action persistence.

---

# Context
Filename: 2026-06-02-ai-sentiment-review-gate.md
Created On: 2026-06-02
Created By: AI
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
继续优化 AI Money 工作台，让市场风向、舆论和人性偏差不只是展示信息，而是进入 AI 推进 paper/testnet 前的决策链。

# Analysis
`/ai-money` 已有“AI 风向 / 人性”面板，但当前 `nextAIGoalDecision` 在强回测结果出现后会直接暴露“采用为 paper 候选”。这意味着高 FOMO、拥挤交易或恐慌信号不会阻止用户继续推进。

`actionPlanFromAnalysis` 已有人工检查项，并且 `manualActionTransition` / `updateQueueAction` 已能持久化手动步骤。新增 `sentiment_review` 可以复用这条链路。

# Proposed Solution
当 `aiSentimentCompassFromAnalysis(analysis).stage` 为 `heated`、`fearful` 或 `data_gap`，且 `sentiment_review` 尚未 `done` 时，`nextAIGoalDecision` 在 paper 候选前返回 `sentiment_review` 阶段。行动队列中新增“复核风向 / 人性”项，用户确认后才继续进入 paper 候选。

不改变自动回测、策略预填、paper watch、测试网或主网闸门逻辑。

# Implementation Plan
1. 在 `client/data/ai-goal-preset.test.mjs` 写失败测试，要求 heated 情绪阻止直接采用 paper 候选，完成 `sentiment_review` 后恢复 paper 候选。
2. 同一测试文件扩展 `manualActionTransition`，要求 `sentiment_review` 可被标记完成。
3. 在 `client/data/ai-goal-preset.mjs` 将 `sentiment_review` 加入可手动转换动作。
4. 在 `nextAIGoalDecision` 中，候选存在但 paper watch 不存在时检查风向阶段；未复核则返回 `sentiment_review`。
5. 在 `actionPlanFromAnalysis` 中新增 `sentiment_review` 行动项，按 compass 阶段设置 `manual` 或 `done`。
6. 在 `client/app/(dashboard)/ai-money/client.tsx` 的 `ActionButton` 中给 `sentiment_review` 渲染数据链接和手动确认按钮。
7. 运行 helper 测试、typecheck、lint、build、diff check 和浏览器烟测。

Implementation Checklist:
1. Add failing tests for sentiment review gating.
2. Run the helper test and confirm RED.
3. Implement `sentiment_review` in helper logic.
4. Wire the action button UI.
5. Run verification commands.

# Current Execution Step
> Currently executing: "5. Run verification commands"

# Task Progress
*   2026-06-02
    *   Step: 1. Add failing tests for sentiment review gating
    *   Modifications: Added tests for heated sentiment review gating and manual transition.
    *   Change Summary: Defined the desired behavior before production implementation.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 3-4. Implement sentiment review gate
    *   Modifications: Added `sentiment_review` action, decision gate, and action button.
    *   Change Summary: Heated or fearful AI sentiment now requires human review before adopting a paper candidate.
    *   Reason: Executing plan steps 3-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-02
    *   Step: 4. Surface sentiment review in daily mission
    *   Modifications: Added a high-priority `sentiment_review` mission task.
    *   Change Summary: Today’s AI task now points users to sentiment review before paper adoption when AI detects heated human-bias risk.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation matches the plan for this increment. Verified with:

- `node --test client/data/ai-goal-preset.test.mjs` — 47/47 pass
- `yarn typecheck` — pass
- `yarn lint` — pass with one existing warning in `client/data/use-activity-center.tsx`
- `git diff --check` — pass
- `yarn build` — pass after rerun with network approval because Next.js needed to fetch Google Fonts
- Browser smoke for `http://localhost:3000/ai-money` — redirected to `/login?next=%2Fai-money` as expected in an unauthenticated session, with no browser error logs

No trading execution paths, order submission paths, wallet approval paths, or mainnet gates were changed.
