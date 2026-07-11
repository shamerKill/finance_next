# AI Money Daily Mission Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the "今日 AI 任务" list point to AI provider setup when real AI is blocked or still loading before any analysis exists.

**Architecture:** `client/data/ai-goal-preset.mjs` keeps deriving task-list state. `aiDailyMissionFromState` will accept an optional `providerGate`; with no active analysis and a blocked/loading gate, it returns a single high-priority `open_link` task to `/settings/ai` instead of a scan task. The AI Money page passes the already computed provider gate into the daily mission builder. Ready, unknown, missing gate, and existing-analysis behavior remain unchanged.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware daily mission behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing `aiDailyMissionFromState starts with today's safe scan...` case:

- With no analysis and a blocked `providerGate`, mission focus is `provider_blocked`, first task is `open_link`, href is `/settings/ai`, and no `proposedFormState` is attached.
- With no analysis and a loading `providerGate`, mission focus is `provider_loading`, first task is `open_link`, href is `/settings/ai`, and the title mentions provider confirmation.
- With no analysis and a ready `providerGate`, the existing `daily_scan` behavior remains.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the blocked/loading tests fail because `aiDailyMissionFromState` does not yet read `providerGate`.

### Task 2: Implement provider-aware daily mission state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiDailyMissionFromState`.

**Step 2: Return setup task before idle scan tasks**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return:

- `focus`: `provider_blocked` or `provider_loading`
- `title: "今日 AI 任务"`
- `tone: "warning"`
- `summary` from the gate or a safe fallback
- one task with `id`, `title`, `detail`, `priority: "high"`, `status: "blocked"` for blocked or `"pending"` for loading, `tone: "warning"`, `actionKind: "open_link"`, and `href` from the gate or `/settings/ai`

**Step 3: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current mission generation unchanged.

### Task 3: Pass provider gate from AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder type**

Add `providerGate?: AIProviderReadinessGateState | null` to the `buildDailyMission` input type.

**Step 2: Pass computed gate**

Pass `providerGate` into `buildDailyMission`.

No panel rendering change is required because `dailyMissionTaskCommandFromTask` and `AIDailyMissionPanel` already handle `open_link`.

### Task 4: Verify and review

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
yarn typecheck
yarn lint
git diff --check
```

Expected:

- Node tests pass.
- TypeScript passes.
- Lint passes, allowing the existing warning in `client/data/use-activity-center.tsx`.
- Diff check reports no whitespace errors.

Implementation Checklist:
1. Add failing daily-mission tests for blocked, loading, and ready provider gates.
2. Run the focused Node test and confirm blocked/loading tests fail for the expected reason.
3. Update `aiDailyMissionFromState` to accept `providerGate` and return setup tasks for blocked/loading idle states.
4. Update the AI Money page daily-mission builder type and call to pass `providerGate`.
5. Re-run the focused Node test and confirm it passes.
6. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
7. Review the implementation against this plan and report any deviations.

## Task Progress

* 2026-06-03 14:06:24 CST
  * Step: 1-2. Add provider-gate tests and verify RED.
  * Modifications: Added blocked, loading, and ready provider-gate coverage to `client/data/ai-goal-preset.test.mjs`; ran `node --test client/data/ai-goal-preset.test.mjs` and observed the blocked/loading cases fail because `aiDailyMissionFromState` still returned `scan_today`.
  * Change Summary: The test suite now captures the missing daily-mission provider gate behavior before implementation.
  * Reason: Executing plan steps 1 and 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:06:24 CST
  * Step: 3. Update `aiDailyMissionFromState`.
  * Modifications: Added optional `providerGate` input and a no-analysis blocked/loading branch that returns one high-priority `open_link` task to `/settings/ai`.
  * Change Summary: Daily Mission no longer proposes a fresh scan while the real AI provider is blocked or still loading.
  * Reason: Executing plan step 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:06:24 CST
  * Step: 4. Pass `providerGate` from AI Money page.
  * Modifications: Extended the `buildDailyMission` input type in `client/app/(dashboard)/ai-money/client.tsx` and passed the computed `providerGate` value into `buildDailyMission`.
  * Change Summary: The page now supplies provider readiness state to the daily mission helper.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:06:24 CST
  * Step: 5-7. Verify and review.
  * Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`; reviewed modified snippets against the plan.
  * Change Summary: Verification passed. Lint retains the known pre-existing warning at `client/data/use-activity-center.tsx:138`.
  * Reason: Executing plan steps 5, 6, and 7.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. The new tests cover blocked, loading, and ready provider states; `aiDailyMissionFromState` returns the provider setup/open-link task before idle scan generation only for blocked/loading gates with no active analysis; the AI Money page passes the computed `providerGate`; verification commands passed with only the known existing lint warning.
