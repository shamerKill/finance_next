# Daily Mission Open Radar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money daily mission actionable when today's radar scan already exists.

**Architecture:** Keep the fix in the pure AI goal helper layer. `aiDailyMissionFromState` already derives the daily task from `dailyRadarStatus`; it should attach the existing run href when the task is `open_today_run`, allowing the existing UI link renderer to work without new UI behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test near the existing `aiDailyMissionFromState` tests:

- Build `dailyRadarStatusFromRuns` with a fresh run id `run_today`.
- Call `aiDailyMissionFromState` with no active analysis.
- Assert first task has `actionKind === "open_today_run"`.
- Assert first task has `href === "/ai-money?run=run_today"`.

**Step 2: Run focused test**

Run: `node --test --test-name-pattern "opens today's existing radar" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `href` is currently undefined.

### Task 2: Implement Href

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add href in `aiDailyMissionFromState`**

When no analysis is active and the derived `actionKind` is `open_today_run`, set the task href to `aiMoneyRunHref(dailyRadarStatus.run.id)`.

### Task 3: Verify

**Step 1:** Run focused test.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 4:** Run `git diff --check`.

## Execution Notes

**2026-06-03**

- RED confirmed with `node --test --test-name-pattern "opens today's existing radar" client/data/ai-goal-preset.test.mjs`: failed because the daily mission task href was `undefined`.
- URL convention correction: the app reads `runId`, so the expected href is `/ai-money?runId=run_today`.
- GREEN confirmed with `node --test --test-name-pattern "opens today's existing radar" client/data/ai-goal-preset.test.mjs`: 1 test passed, 0 failed.
- Full AI helper verification confirmed with `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 168 tests passed, 0 failed.
- Client type verification confirmed with `yarn typecheck`: passed.
- Client lint verification confirmed with `yarn lint`: exited 0 with the pre-existing warning in `client/data/use-activity-center.tsx:138`.
- Diff whitespace verification confirmed with `git diff --check`: passed.
