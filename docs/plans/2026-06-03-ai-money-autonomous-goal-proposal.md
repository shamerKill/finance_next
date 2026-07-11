# AI Money Autonomous Goal Proposal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the idle AI Money state propose a concrete AI-generated money goal that can be analyzed and validated immediately, using market direction, sentiment, human-bias checks, and safe paper-only boundaries.

**Architecture:** Add a small data-layer proposal helper in `client/data/ai-goal-preset.mjs`, then attach the proposal to the existing `aiNowActionFromState` scan task. The UI can continue using the existing daily scan/analyze pipeline; this increment makes the AI's intended target explicit and testable.

**Tech Stack:** ESM helper functions, Node test runner, existing AI Money client data model.

### Task 1: RED tests for autonomous goal proposal

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Add idle now-action proposal expectations**

Update the idle `aiNowActionFromState` test so it expects:
- `now.proposedFormState.goal` includes `AI 自动`
- `now.proposedFormState.goal` includes market direction, sentiment/news, human bias, and paper validation language
- `now.proposedFormState.symbolsText === "BTC, ETH, SOL"`
- `now.primaryAction.label === "AI 自动生成目标并验证"`

**Step 2: Add memory-based proposal test**

Add a test proving the proposal reuses recent run symbols, dedupes them, and keeps execution mode at `paper`.

**Step 3: Run focused RED test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`

Expected: FAIL because `aiNowActionFromState` does not return `proposedFormState` and still labels the idle action as `今日扫描`.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add proposal helper**

Add `aiAutonomousGoalProposalFromState({ runs, dailyRadarStatus, now })` near the existing daily-radar helpers. It should call `dailyRadarFormStateFromRuns(runs, now)` and return:
- `proposedFormState`
- `summary`
- `nextActions`

**Step 2: Use proposal in idle daily mission / now action path**

When `aiDailyMissionFromState` has no analysis and no follow-up run, use the proposal's form state in the `daily_scan` task and change the title to `AI 自动生成目标并验证`.

**Step 3: Preserve current scan execution path**

Keep `actionKind: "scan_today"` so existing UI still runs `onDailyRadarScan`, which already applies `dailyRadarFormStateFromRuns` and runs analysis plus validation.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`

**Step 1: Run focused GREEN test**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`

Expected: PASS.

**Step 2: Run full validation**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/`
- `git diff --check`

Expected: tests/typecheck pass; lint exits 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning.

Implementation Checklist:
1. Update idle now-action RED test.
2. Add memory-based autonomous proposal RED test.
3. Run focused RED test and confirm failure.
4. Add autonomous proposal helper.
5. Attach proposed form state to idle daily mission / now action.
6. Run focused GREEN test.
7. Run full verification.
8. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "Final review completed."

# Task Progress
*   [2026-06-03 08:21:40 CST]
    *   Step: 1-2. RED tests for autonomous goal proposal
    *   Modifications: Updated `client/data/ai-goal-preset.test.mjs` so idle now-action state must expose an AI-generated proposed form state, and added a memory-based proposal test.
    *   Change Summary: The tests now require explicit autonomous goal text covering market direction, news sentiment, human bias, paper validation, and safe execution mode.
    *   Reason: Executing plan steps 1-2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:21:40 CST]
    *   Step: 3. Run focused RED test and confirm failure
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'autonomous goal|starts idle users'`; the idle test failed because the existing action label is `今日扫描` and there is no proposed form state yet.
    *   Change Summary: Confirmed the missing autonomous proposal behavior.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:24:33 CST]
    *   Step: 4. Add autonomous proposal helper
    *   Modifications: Added `aiAutonomousGoalProposalFromState` in `client/data/ai-goal-preset.mjs` and strengthened `dailyRadarFormStateFromRuns` so the generated goal explicitly includes AI automation, market direction, news sentiment, human bias, paper validation, and no-mainnet language.
    *   Change Summary: Idle AI Money state can now produce a concrete safe赚钱目标 proposal from current/history symbols.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:24:33 CST]
    *   Step: 5. Attach proposed form state to idle daily mission / now action
    *   Modifications: Updated `aiDailyMissionFromState` to attach `proposedFormState` to the `daily_scan` task and updated `aiNowActionFromState` to expose it, label the action `AI 自动生成目标并验证`, and include explicit回测 / paper / no-mainnet handoff copy.
    *   Change Summary: The first idle action is now framed as AI autonomously proposing, analyzing, and validating a goal instead of a generic scan.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   [2026-06-03 08:24:33 CST]
    *   Step: 6-7. Run focused and full verification
    *   Modifications: Ran focused GREEN test, full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a trailing-whitespace scan.
    *   Change Summary: Focused tests passed; full helper test suite passed 181/181; typecheck passed; lint exited 0 with the existing unrelated `client/data/use-activity-center.tsx:138` warning; diff check passed; trailing-whitespace scan had no matches.
    *   Reason: Executing plan steps 6-7
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

The implementation added the autonomous goal proposal helper, attached the proposed form state to the idle daily mission / now action path, preserved the existing `scan_today` execution route, and added RED/GREEN coverage for idle and memory-based proposals. No unreported deviations were found.
