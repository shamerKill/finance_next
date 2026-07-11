# AI Paper Strategy Before Watch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After a paper candidate is adopted, make the current AI task open the prefilled paper strategy before asking the user to complete paper observation.

**Architecture:** Use the existing persisted `strategy` action created by `acceptPaperCandidate`. When `nextAIGoalDecision` is in `paper_watch` and the persisted `strategy` action is still `ready`, add a high-priority `open_link` mission task before the `paper_watch` manual task. This keeps the existing safety gates intact while making the flow easier to follow.

**Tech Stack:** ESM helper functions, Node test runner, existing AI Money current-task UI.

### Task 1: RED test for strategy-before-watch priority

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Add now-action test**

Add a test that calls `aiNowActionFromState` with:
- a strong validated candidate,
- `sentiment_review` already done,
- persisted `strategy` with `status: "ready"` and `href: "/option?source=ai-goal&draft=btca"`,
- persisted `paper_watch` with `status: "manual"` and `href: "/backtests/run_btc"`.

Assert:
- `now.stage === "paper_watch"`.
- `now.title` includes `paper 策略`.
- `now.primaryAction.kind === "open_link"`.
- `now.primaryHref` is the strategy href.
- `now.summary` includes the strategy action note.

**Step 2: Run focused RED test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper strategy|active paper watch'`

Expected: FAIL because the current implementation prioritizes the `paper_watch` manual action and does not open the ready strategy action first.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Read persisted strategy action**

Inside `aiDailyMissionFromState`, read `const strategyAction = persistedActionById(persistedActions, "strategy")` near the other persisted actions.

**Step 2: Add strategy-open task before paper_watch**

Before the existing `decision.stage === "paper_watch"` task, add a branch:
- only when `decision.stage === "paper_watch"`,
- `strategyAction.status === "ready"`,
- and `strategyAction.href` exists.

Push a task with:
- `id: "save_paper_strategy"`
- `title: "保存 paper 策略草案"`
- `detail: strategyAction.note || "先打开 AI 预填策略，保存为 paper 观察对象。"`
- `priority: "high"`
- `status: "ready"`
- `tone: "success"`
- `actionKind: "open_link"`
- `href: strategyAction.href`

Leave the existing `paper_watch` task in place after it.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`
- Update: this plan file

**Step 1: Run focused GREEN test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper strategy|active paper watch'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`
- `rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-paper-strategy-before-watch.md`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks pass.

Implementation Checklist:
1. Add RED now-action test for ready paper strategy priority.
2. Run focused RED test and confirm expected failure.
3. Read persisted `strategy` action in `aiDailyMissionFromState`.
4. Add ready strategy open-link task before active `paper_watch`.
5. Run focused and full verification.
6. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "6. Append task progress and final review to this plan."

# Task Progress
*   [2026-06-03 08:52:39 CST]
    *   Step: 1. Add RED now-action test for ready paper strategy priority
    *   Modifications: Added `aiNowActionFromState opens ready paper strategy before paper watch` in `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: The test requires a ready persisted `strategy` action to become the current open-link task before active paper observation.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:52:39 CST]
    *   Step: 2. Run focused RED test and confirm expected failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper strategy|active paper watch'`; it failed because the current task title was not the paper strategy entry.
    *   Change Summary: Confirmed the current task skipped the ready paper strategy action and went straight to paper watch.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:52:39 CST]
    *   Step: 3. Read persisted `strategy` action in `aiDailyMissionFromState`
    *   Modifications: Added `strategyAction = persistedActionById(persistedActions, "strategy")` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: The daily mission builder can now inspect whether an AI paper strategy is still waiting to be opened/saved.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:52:39 CST]
    *   Step: 4. Add ready strategy open-link task before active `paper_watch`
    *   Modifications: Added `save_paper_strategy` as a high-priority ready `open_link` task when `decision.stage === "paper_watch"` and the persisted `strategy` action is ready with a href.
    *   Change Summary: After adopting a paper candidate, the current task now opens the prefilled paper strategy before asking for paper-watch completion.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:52:39 CST]
    *   Step: 5. Run focused and full verification
    *   Modifications: Ran the focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan for touched files.
    *   Change Summary: Focused and full helper tests passed; typecheck passed; lint exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks passed.
    *   Reason: Executing plan step 5
    *   Blockers: Browser render was not rerun because `/ai-money` currently requires a valid gateway-authenticated session.
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:52:39 CST]
    *   Step: 6. Append task progress and final review to this plan
    *   Modifications: Updated this plan with RED/GREEN progress, verification evidence, and final review.
    *   Change Summary: Documentation now reflects the completed paper-strategy-before-watch priority increment.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

Checklist verification:
1. `client/data/ai-goal-preset.test.mjs` includes RED coverage for ready paper strategy priority.
2. The focused RED command failed before implementation because active paper watch skipped the ready strategy action.
3. `client/data/ai-goal-preset.mjs` reads the persisted `strategy` action in `aiDailyMissionFromState`.
4. `aiDailyMissionFromState` now adds `save_paper_strategy` before `paper_watch` when the strategy action is ready.
5. Focused and full verification passed, with only the known unrelated lint warning.
6. No unreported deviations were found.
