# AI Autonomous Command Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give AI Money a single "AI autonomous next step" command card so the user can see one recommended AI action, why it matters, and what safety boundary applies.

**Architecture:** Add a pure data helper that composes existing `aiCommandCenterFromState`, `aiNowActionFromState`, and `aiAutopilotStateFromAnalysis` output into one small command object. Render it near the top of `/ai-money` with the same action handlers already used by the existing panels.

**Tech Stack:** Next.js client component, plain JavaScript helper, Node test runner.

### Task 1: Data Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing tests**

Add tests for `aiAutonomousCommandFromState()`:
- no active analysis: returns stage `start`, owner `AI`, primary action `analyze_and_validate`, and copy that says AI will scan market, sentiment, human bias, strategy blueprint, and validation.
- active analysis with runnable drafts but no validation: returns primary action `run_all_backtests` and states it will only create validation tasks, not trade.

**Step 2: Run tests**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the helper is not exported.

**Step 3: Implement helper**

Use existing helpers only:
- `aiCommandCenterFromState()`
- `aiNowActionFromState()`
- `aiAutopilotStateFromAnalysis()`

Return `{ stage, tone, owner, title, summary, primaryAction, primaryHref, confidenceLabel, safety, why, aiWillDo, humanMustDo }`.

**Step 4: Verify helper**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: UI Card

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Add `aiAutonomousCommandFromState` to imports and define a local `AIAutonomousCommandState` type.

**Step 2: Compute command state**

Build it alongside `nowAction` using current `analysis`, `activeActions`, `activeValidationRuns`, `runs`, `accounts`, and `dailyRadarStatus`.

**Step 3: Render card near the top**

Add `AIAutonomousCommandPanel` before the existing `AINowActionPanel`. It should support the same action kinds already handled by `AINowActionPanel`: analyze/scan, run all backtests, accept paper candidate, validate/refresh run, complete manual action, and open link.

**Step 4: Verify**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`
