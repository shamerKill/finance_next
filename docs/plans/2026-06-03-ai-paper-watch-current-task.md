# AI Paper Watch Current Task Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After a paper candidate is adopted, make AI Money's current-task panel guide the user through the active `paper_watch` review instead of falling back to a scan action.

**Architecture:** Add a `paper_watch` mission task when `nextAIGoalDecision` returns `paper_watch`, and map that task to the existing `complete_manual_action` button for the persisted `paper_watch` action. Keep all behavior within the frontend state helpers; do not change backend actions or execution gates.

**Tech Stack:** ESM helper functions, Node test runner, existing AI Money current-task UI.

### Task 1: RED test for active paper watch current task

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Add now-action active paper watch test**

Add a test that calls `aiNowActionFromState` with:
- a strong validated candidate,
- `sentiment_review` already done,
- persisted `paper_watch` with `status: "manual"`, `href: "/backtests/run_btc"`, and an observation note.

Assert:
- `now.stage === "paper_watch"`.
- `now.owner === "你"`.
- `now.title` includes `paper`.
- `now.primaryAction` is `{ kind: "complete_manual_action", label: "完成 paper 复盘", actionId: "paper_watch" }`.
- `now.primaryHref === "/backtests/run_btc"`.
- `now.guardrail` mentions `paper`.
- `now.summary` includes the paper observation note.

**Step 2: Run focused RED test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'active paper watch|paper watch'`

Expected: FAIL because the current implementation maps the active paper watch state to an observation-signal scan task.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add paper_watch mission task**

In `aiDailyMissionFromState`, after the `analyze_and_validate` branch and before watch-signal fallback tasks, add a branch for `decision.stage === "paper_watch"` that pushes a high-priority task:
- `id: "paper_watch"`
- `title: decision.title`
- `detail: decision.reasons[0] || decision.summary`
- `status: "manual"`
- `tone: decision.tone`
- `actionKind: "paper_watch"`
- `href: decision.primaryHref`

**Step 2: Map paper_watch to manual action**

In `nowActionPrimaryFromTask`, add `actionKind === "paper_watch"` handling that returns:
- `primaryAction: { kind: "complete_manual_action", label: "完成 paper 复盘", actionId: "paper_watch" }`
- `primaryHref: task.href`

**Step 3: Ensure owner is human**

No new case is needed in `nowActionOwner`; `paper_watch` should fall through to `"你"`. If the RED output shows otherwise after adding the mission task, add an explicit `"paper_watch" -> "你"` case.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`
- Update: this plan file

**Step 1: Run focused GREEN test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'active paper watch|paper watch'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`
- `rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-paper-watch-current-task.md`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks pass.

Implementation Checklist:
1. Add RED now-action test for active paper watch.
2. Run focused RED test and confirm expected failure.
3. Add `paper_watch` mission task.
4. Map `paper_watch` to `complete_manual_action`.
5. Run focused and full verification.
6. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "6. Append task progress and final review to this plan."

# Task Progress
*   [2026-06-03 08:48:01 CST]
    *   Step: 1. Add RED now-action test for active paper watch
    *   Modifications: Added `aiNowActionFromState makes active paper watch the current task` in `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: The test verifies an adopted paper candidate with a manual `paper_watch` action becomes the current task and maps to `complete_manual_action`.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:48:01 CST]
    *   Step: 2. Run focused RED test and confirm expected failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'active paper watch|paper watch'`; it failed because the current task owner was `AI` instead of `你`, matching the fallback scan-task bug.
    *   Change Summary: Confirmed active `paper_watch` was not being surfaced as the manual current task.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:48:01 CST]
    *   Step: 3. Add `paper_watch` mission task
    *   Modifications: Updated `client/data/ai-goal-preset.mjs` so `aiDailyMissionFromState` pushes a high-priority manual `paper_watch` task when `nextAIGoalDecision` is in `paper_watch`.
    *   Change Summary: The mission queue now prioritizes active paper observation instead of falling through to watch signals or review gates.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:48:01 CST]
    *   Step: 4. Map `paper_watch` to `complete_manual_action`
    *   Modifications: Added `paper_watch` handling in `nowActionPrimaryFromTask`, returning `{ kind: "complete_manual_action", label: "完成 paper 复盘", actionId: "paper_watch" }`.
    *   Change Summary: The current-task button now completes the persisted paper review action instead of starting a scan.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:48:01 CST]
    *   Step: 5. Run focused and full verification
    *   Modifications: Ran the focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan for touched files.
    *   Change Summary: Focused and full helper tests passed; typecheck passed; lint exited 0 with the known unrelated `client/data/use-activity-center.tsx:138` warning; diff and whitespace checks passed.
    *   Reason: Executing plan step 5
    *   Blockers: Browser render was not rerun because `/ai-money` currently requires a valid gateway-authenticated session.
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:48:01 CST]
    *   Step: 6. Append task progress and final review to this plan
    *   Modifications: Updated this plan with RED/GREEN progress, verification evidence, and final review.
    *   Change Summary: Documentation now reflects the completed active-paper-watch current-task fix.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

Checklist verification:
1. `client/data/ai-goal-preset.test.mjs` includes RED coverage for active `paper_watch`.
2. The focused RED command failed before implementation because active paper watch fell through to the wrong current task.
3. `client/data/ai-goal-preset.mjs` now adds a manual `paper_watch` mission task when decision stage is `paper_watch`.
4. `nowActionPrimaryFromTask` maps `paper_watch` to `complete_manual_action` with `actionId: "paper_watch"`.
5. Focused and full verification passed, with only the known unrelated lint warning.
6. No unreported deviations were found.
