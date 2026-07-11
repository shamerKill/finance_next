# AI Money Open Follow-up Run Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money current task open the highest-priority historical AI run when that run already has a follow-up action, instead of falling back to a new daily scan.

**Architecture:** Keep the behavior in the pure `ai-goal-preset.mjs` helpers so the UI receives one clear primary action. Preserve `runId` and `href` through the daily mission task, then convert `open_run` into an `open_link` primary action for the existing `AINowActionPanel`.

**Tech Stack:** Node test runner, Next.js client helper module, existing AI Money action queue.

### Task 1: Add RED coverage for historical follow-up opening

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing tests**

Add tests showing that a historical run with `paper_watch` manual follow-up becomes an `open_run` daily mission task and an `open_link` now action pointing to `/ai-money?runId=<id>`.

**Step 2: Run focused test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "opens paper follow-up"`

Expected: FAIL because `aiNowActionFromState` currently falls back to `scan_today`.

### Task 2: Preserve open-run follow-up actions

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Implement minimal helper change**

Keep `open_run` as the mission action kind for historical follow-ups that are not validation or refresh actions. Add `open_run` handling in `nowActionOwner` and `nowActionPrimaryFromTask` so it produces `{ kind: "open_link", label }` with the task href.

**Step 2: Run focused test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "opens paper follow-up"`

Expected: PASS.

### Task 3: Verify helper suite and client checks

**Files:**
- No code changes expected.

**Step 1: Run helper tests**

Run: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`

Expected: PASS.

**Step 2: Run client typecheck and lint**

Run in `client`: `yarn typecheck`

Expected: PASS.

Run in `client`: `yarn lint`

Expected: exit 0. Existing unrelated warning in `client/data/use-activity-center.tsx` may remain.

**Step 3: Run diff whitespace check**

Run: `git diff --check`

Expected: PASS.

# Task Progress

* 2026-06-03 07:46:12 CST
  * Step: Task 1 - Add RED coverage for historical follow-up opening
  * Modifications: Added daily mission and now-action tests for a historical `paper_watch` follow-up run.
  * Change Summary: The tests prove a historical paper observation run should open `/ai-money?runId=paper_run` instead of starting a fresh scan.
  * Reason: Executing plan Task 1.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:46:12 CST
  * Step: Task 2 - Preserve open-run follow-up actions
  * Modifications: Preserved `open_run` in `aiDailyMissionFromState`, included it in `nowActionOwner`, and mapped it to an `open_link` primary action in `nowActionPrimaryFromTask`.
  * Change Summary: AI Money now restores the highest-priority historical run when follow-up is needed.
  * Reason: Executing plan Task 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 07:46:12 CST
  * Step: Task 3 - Verify helper suite and client checks
  * Modifications: No code changes.
  * Change Summary: Focused RED/GREEN, full helper tests, typecheck, lint, and diff whitespace checks were run.
  * Reason: Executing plan Task 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

# Final Review

Implementation perfectly matches the final plan. The helper behavior now keeps historical follow-up intent intact: validation and refresh still execute directly, while paper/saved-strategy follow-ups open the relevant AI run instead of falling back to a daily scan. No unreported deviations were found.
