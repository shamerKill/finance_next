# AI Money Paper Adoption Explain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make strong AI backtest validation explain why paper adoption is acceptable and what market or human signals must be watched.

**Architecture:** Keep the scoring and execution gates unchanged. Add a presentation helper in the AI goal preset layer so the daily mission and now-action summary inherit the same evidence-rich detail from the selected paper candidate.

**Tech Stack:** Node test runner, ESM helper modules, Next.js client data helpers.

### Task 1: RED test for paper adoption explanation

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add assertions to the existing strong validation mission and now-action tests. The mission detail and now summary must include total return, max drawdown, Sharpe, and at least one market or human observation signal.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper adoption|strong validation'`

Expected: FAIL because the current detail only says the strategy score and paper observation.

### Task 2: GREEN implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add minimal helper**

Create a small helper that formats the candidate score, total return, max drawdown, Sharpe, and the first available human/watch signal.

**Step 2: Wire helper into daily mission**

Use the helper for the `accept_paper_candidate` task detail. `aiNowActionFromState` already uses task detail as summary, so it should inherit the same explanation.

**Step 3: Run focused tests**

Run: `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper adoption|strong validation'`

Expected: PASS.

### Task 3: Verification

**Files:**
- Review: `client/data/ai-goal-preset.mjs`
- Review: `client/data/ai-goal-preset.test.mjs`

**Step 1: Run full helper tests**

Run: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`

Expected: PASS.

**Step 2: Run client validation**

Run in `client/`: `yarn typecheck`

Expected: PASS.

Run in `client/`: `yarn lint`

Expected: exit 0. Existing unrelated warning in `client/data/use-activity-center.tsx` may remain.

**Step 3: Run whitespace validation**

Run: `git diff --check`

Expected: no output.

Implementation Checklist:
1. Add RED assertions for mission detail and now summary.
2. Run focused test command and confirm expected failure.
3. Add paper adoption explanation helper.
4. Replace strong validation task detail with the helper.
5. Run focused test command and confirm pass.
6. Run full helper tests, typecheck, lint, and diff check.
7. Append task progress and final review to this plan.

# Current Execution Step
> Currently executing: "1. Add RED assertions for mission detail and now summary."

# Task Progress

*   2026-06-03T08:00:00+08:00
    *   Step: 1. Add RED assertions for mission detail and now summary.
    *   Modifications: Added assertions in `client/data/ai-goal-preset.test.mjs` for total return, drawdown, Sharpe, human factor, and watch signal in strong validation paper adoption output.
    *   Change Summary: Focused tests now describe the missing AI explanation layer.
    *   Reason: Executing plan step 1
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 2. Run focused test command and confirm expected failure.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper adoption|strong validation'`.
    *   Change Summary: RED confirmed with failures on missing `收益 12.00%` in mission detail and now summary.
    *   Reason: Executing plan step 2
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 3. Add paper adoption explanation helper.
    *   Modifications: Added `formatSharpeValue` and `paperAdoptionDetailFromCandidate` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: Strong paper candidates now expose score, return, drawdown, Sharpe, and observation signals in one explanation string.
    *   Reason: Executing plan step 3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 4. Replace strong validation task detail with the helper.
    *   Modifications: Updated `accept_paper_candidate` daily mission detail to use `paperAdoptionDetailFromCandidate`.
    *   Change Summary: Daily mission and now action now share the same AI paper adoption explanation.
    *   Reason: Executing plan step 4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 5. Run focused test command and confirm pass.
    *   Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'paper adoption|strong validation'`.
    *   Change Summary: GREEN confirmed, 174 focused helper tests passed under the pattern command.
    *   Reason: Executing plan step 5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

*   2026-06-03T08:00:00+08:00
    *   Step: 6. Run full helper tests, typecheck, lint, and diff check.
    *   Modifications: Ran full helper tests, `yarn typecheck`, `yarn lint`, `git diff --check`, and a separate trailing-whitespace `rg` scan for the untracked AI Money helper files.
    *   Change Summary: 176 helper tests passed; typecheck passed; lint exited 0 with the existing unrelated `use-activity-center.tsx` warning; diff check and trailing-whitespace scan were clean.
    *   Reason: Executing plan step 6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

The RED assertions failed before production changes because the mission detail and now summary lacked return, drawdown, Sharpe, and observation signals. The GREEN implementation added only the planned helper and switched the strong validation paper candidate detail to it. No scoring, gate, execution, or backend behavior changed.

Verification evidence:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 176 pass, 0 fail.
- `yarn typecheck`: exit 0.
- `yarn lint`: exit 0 with one pre-existing unrelated warning in `client/data/use-activity-center.tsx`.
- `git diff --check`: exit 0.
- `rg -n "[[:blank:]]$" client/data/ai-goal-preset.mjs client/data/ai-goal-preset.test.mjs docs/plans/2026-06-03-ai-money-paper-adoption-explain.md`: no matches.
