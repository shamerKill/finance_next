# AI Now Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a single top-of-page "AI 当前任务" decision strip so the operator always sees the one safest next action instead of choosing between many panels.

**Architecture:** A new pure helper in `client/data/ai-goal-preset.mjs` derives the current task from existing AI decision, daily mission, validation, and paper evidence gates. The AI Money page renders the derived state above the existing command center and routes its primary action through existing handlers.

**Tech Stack:** Next.js client component, HeroUI buttons, existing Node `node --test` helper tests.

### Task 1: Add failing tests for current-task selection

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests that verify:
- No active analysis returns an AI-owned scan task with `scan_today`.
- Strong validation with completed sentiment review returns `accept_paper_candidate`.
- A `paper_watch` marked done without review evidence returns a human-owned `open_link` task to review paper evidence and does not expose testnet.

**Step 2: Run focused test to verify failure**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiNowActionFromState` is not exported yet.

### Task 2: Implement `aiNowActionFromState`

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Export the helper**

Implement `aiNowActionFromState({ analysis, persistedActions, validationRuns, runs, dailyRadarStatus })`.

**Step 2: Use existing helpers**

Reuse:
- `aiDailyMissionFromState`
- `nextAIGoalDecision`
- `paperCandidateFromValidation`
- `paperWatchCompletionHasEvidence`
- `persistedActionById`

**Step 3: Return stable UI state**

Return:
- `stage`, `tone`, `owner`, `title`, `summary`
- `primaryAction`, `primaryHref`
- `guardrail`, `why`, `handoff`, `nextActions`

Keep action kinds compatible with current UI handlers: `scan_today`, `run_all_backtests`, `accept_paper_candidate`, and `open_link`.

### Task 3: Render the panel in AI Money

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Add `aiNowActionFromState` to imports and define a local `AINowActionState` type.

**Step 2: Build state**

Call `buildNowAction` after daily radar, active actions, active validation runs, and candidate are available.

**Step 3: Add panel**

Create `AINowActionPanel` and render it above `AICommandCenterPanel`.

**Step 4: Wire primary actions**

Use existing handlers:
- `scan_today` -> `onDailyRadarScan`
- `run_all_backtests` -> `runAllBacktests`
- `accept_paper_candidate` -> `acceptPaperCandidate`
- `open_link` -> `Link`

### Task 4: Verify

**Files:**
- Verify only.

**Step 1: Run focused helper tests**

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

**Step 2: Run frontend checks**

```bash
cd client
yarn typecheck
yarn lint
```

Expected: typecheck PASS; lint exits 0, allowing the known unrelated warning in `client/data/use-activity-center.tsx:138`.

**Step 3: Run whitespace check**

```bash
git diff --check
```

Expected: PASS.
