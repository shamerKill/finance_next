# Daily Mission Followup Priority Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money daily mission surface the highest-priority AI follow-up when no active analysis is loaded.

**Architecture:** Reuse `aiRunFollowupQueueFromRuns` inside the no-analysis branch of `aiDailyMissionFromState`. When the queue has an attention-worthy primary action, convert it into the first daily mission task so the top of AI Money points at the same action as the follow-up queue.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test near the existing `aiDailyMissionFromState` tests:

- Pass no active analysis.
- Pass `runs` containing an AI run with `strategyDraftCount > 0` and context counts present.
- Pass a daily radar status that would otherwise tell the page to scan or open today.
- Assert the first mission task is `validate_run`.
- Assert it carries `runId` and `href` for that AI run.

**Step 2: Run focused test**

Run: `node --test --test-name-pattern "prioritizes follow-up validation" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the no-analysis mission currently uses only daily radar status.

### Task 2: Implement Follow-up Priority

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Convert follow-up primary action to a mission task**

In the no-analysis branch of `aiDailyMissionFromState`, compute `aiRunFollowupQueueFromRuns(runs)`.

If its `stage === "needs_attention"` and it has a primary action, return a daily mission with the queue action as the first task.

### Task 3: Verify

**Step 1:** Run focused test.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 4:** Run `git diff --check`.

## Execution Notes

**2026-06-03**

- RED confirmed with `node --test --test-name-pattern "prioritizes follow-up validation" client/data/ai-goal-preset.test.mjs`: failed because the no-analysis mission still focused `scan_today`.
- GREEN confirmed with `node --test --test-name-pattern "prioritizes follow-up validation" client/data/ai-goal-preset.test.mjs`: 1 test passed, 0 failed.
- Minor correction: `aiNowActionFromState` also consumes the daily mission task. Added RED coverage with `node --test --test-name-pattern "opens follow-up validation" client/data/ai-goal-preset.test.mjs`; it failed because follow-up validation mapped back to `scan_today`.
- GREEN confirmed for the now-action mapping with `node --test --test-name-pattern "opens follow-up validation" client/data/ai-goal-preset.test.mjs`: 1 test passed, 0 failed.
- Full AI helper verification confirmed with `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 170 tests passed, 0 failed.
- Client type verification confirmed with `yarn typecheck`: passed.
- Client lint verification confirmed with `yarn lint`: exited 0 with the pre-existing warning in `client/data/use-activity-center.tsx:138`.
- Diff whitespace verification confirmed with `git diff --check`: passed.
