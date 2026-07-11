# AI Daily Mission Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the "今日 AI 任务" panel execute every AI-recommended next step instead of only rendering some of them as passive rows.

**Architecture:** Add a small deterministic helper in `client/data/ai-goal-preset.mjs` that maps an `aiDailyMissionFromState` task into a UI command. The React panel will consume that helper and route commands to the existing callbacks for AI re-analysis, run validation, run refresh, batch backtests, paper adoption, and manual action completion.

**Tech Stack:** Next.js client component, React/TypeScript, Node test runner for `.mjs` helpers.

### Task 1: Add Failing Command Mapping Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import the new helper**

Add `dailyMissionTaskCommandFromTask` to the helper imports.

**Step 2: Add RED tests**

Add tests that assert:
- an `analyze_and_validate` task preserves `proposedFormState`
- a `validate_run` task exposes the target `runId`
- a `refresh_run` task exposes the target `runId`
- a `sentiment_review` task maps to `complete_manual_action` with action id `sentiment_review`
- a `paper_watch` task maps to `complete_manual_action` with action id `paper_watch`

**Step 3: Run focused tests and confirm RED**

Run:

`node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "dailyMissionTaskCommandFromTask"`

Expected: FAIL because the helper is not exported yet.

### Task 2: Implement Command Mapping Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add `dailyMissionTaskCommandFromTask(task)`**

Return a compact command object:
- `kind`: normalized task action
- `label`: task title or a safe fallback
- `href`: task href if present
- `runId`: task run id if present
- `proposedFormState`: task proposed form state if present
- `actionId`: `sentiment_review` or `paper_watch` for manual completion tasks

Keep mappings conservative:
- `scan_today`, `rescan_today`, `analyze_and_validate`, `run_all_backtests`, `accept_paper_candidate`, `validate_run`, `refresh_run`, `open_link`, `open_run`, `open_today_run` stay actionable.
- `sentiment_review` and `paper_watch` become `complete_manual_action`.
- Unknown tasks with `href` become `open_link`; unknown tasks without href return `null`.

**Step 2: Run focused tests and confirm GREEN**

Run:

`node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "dailyMissionTaskCommandFromTask"`

Expected: PASS.

### Task 3: Wire the Daily Mission Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import the helper**

Import `dailyMissionTaskCommandFromTask`.

**Step 2: Extend local task/props types**

Extend `AIDailyMissionTask` with optional `runId` and `proposedFormState`.

Extend `AIDailyMissionPanel` props:
- `runs: TypeAIGoalRun[]`
- `runsBusy: boolean`
- `actionBusyKey: string | null`
- `manualAction?: ActionQueueItem | null`
- `onAnalyzeAndValidate: (next?: AIGoalFormState) => void`
- `onRefreshRun: (run: Pick<TypeAIGoalRun, "id">) => void`
- `onValidateRun: (run: Pick<TypeAIGoalRun, "id">) => void`
- `onUpdateAction: (item: ActionQueueItem) => void`

**Step 3: Route commands in `renderTaskAction`**

Use `dailyMissionTaskCommandFromTask(task)` and render:
- `analyze_and_validate`: call `onAnalyzeAndValidate(command.proposedFormState)`
- `scan_today` / `rescan_today`: call `onScan()`
- `validate_run`: call `onValidateRun` for the matching run id
- `refresh_run`: call `onRefreshRun` for the matching run id
- `run_all_backtests`: call `onRunAllBacktests`
- `accept_paper_candidate`: call `onAcceptPaperCandidate`
- `complete_manual_action`: call `onUpdateAction(manualAction)` when ids match
- `open_link`, `open_run`, `open_today_run`: render a link

**Step 4: Pass existing callbacks at the call site**

Update the `AIDailyMissionPanel` invocation to pass `runs`, `runsBusy`, `onAnalyzeAndValidate`, `refreshRun`, `validateRun`, `nowActionManualItem`, `actionBusyKey`, and `updateQueueAction`.

### Task 4: Verification

**Files:**
- Verify only.

**Step 1: Run helper tests**

Run:

`node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`

Expected: PASS.

**Step 2: Run TypeScript check**

Run in `client/`:

`yarn typecheck`

Expected: PASS.

**Step 3: Run lint**

Run in `client/`:

`yarn lint`

Expected: exit 0. Existing warning in `client/data/use-activity-center.tsx` may remain unrelated.

**Step 4: Run patch hygiene**

Run:

`git diff --check`

Expected: no output.

Implementation Checklist:
1. Import `dailyMissionTaskCommandFromTask` in `client/data/ai-goal-preset.test.mjs`.
2. Add focused RED tests for daily mission task command mapping.
3. Run focused command mapping tests and confirm RED.
4. Implement `dailyMissionTaskCommandFromTask` in `client/data/ai-goal-preset.mjs`.
5. Run focused command mapping tests and confirm GREEN.
6. Import and use `dailyMissionTaskCommandFromTask` in `client/app/(dashboard)/ai-money/client.tsx`.
7. Extend `AIDailyMissionPanel` props/types and wire command actions to existing callbacks.
8. Pass the new callbacks and state into `AIDailyMissionPanel`.
9. Run full helper tests.
10. Run `yarn typecheck` in `client/`.
11. Run `yarn lint` in `client/`.
12. Run `git diff --check`.

# Current Execution Step
> Currently executing: "Final review"

# Task Progress
*   2026-06-03 10:04:32 CST
    *   Step: 1-3. Add focused RED tests for daily mission task command mapping.
    *   Modifications: Imported `dailyMissionTaskCommandFromTask` and added tests for redesign, follow-up validation, refresh, sentiment review, and paper watch command mapping.
    *   Change Summary: RED confirmed because `client/data/ai-goal-preset.mjs` did not export the helper.
    *   Reason: Executing plan steps 1-3
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 10:04:32 CST
    *   Step: 4-5. Implement `dailyMissionTaskCommandFromTask` and confirm GREEN.
    *   Modifications: Added a deterministic task-to-command helper for scan, analyze, validate, refresh, paper adoption, open-link, and manual completion tasks.
    *   Change Summary: Focused helper tests passed after implementation.
    *   Reason: Executing plan steps 4-5
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 10:04:32 CST
    *   Step: 6-8. Wire `AIDailyMissionPanel` to executable commands.
    *   Modifications: Extended daily mission task/props typing, passed run/action callbacks into the panel, and routed commands to existing analyze, scan, validate, refresh, backtest, paper adoption, manual completion, or link actions.
    *   Change Summary: Daily mission rows now provide direct actions for AI redesign, historical run validation, historical run refresh, and manual evidence completion.
    *   Reason: Executing plan steps 6-8
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 10:04:32 CST
    *   Step: 9-12. Run verification.
    *   Modifications: Ran helper tests, TypeScript check, lint, and patch hygiene check.
    *   Change Summary: Verification passed; lint retains the known unrelated warning in `client/data/use-activity-center.tsx`.
    *   Reason: Executing plan steps 9-12
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review
2026-06-03 10:04:32 CST

Implementation perfectly matches the final plan.

The daily mission command helper is covered by tests and the AI Money panel now routes every supported task command to existing safe callbacks. This makes the "今日 AI 任务" surface a direct action panel for AI re-analysis, validation, refresh, paper adoption, and manual evidence completion. No trading gate was relaxed and no new real-order path was added.

Verification completed:
- `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "dailyMissionTaskCommandFromTask"` (RED before implementation, GREEN after)
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck` in `client/`
- `yarn lint` in `client/` (exit 0 with known unrelated warning)
- `git diff --check`
