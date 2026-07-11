# AI Money Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact AI money path that shows the user where the workflow currently is from goal input to paper/testnet readiness.

**Architecture:** Implement a deterministic frontend projection over existing state helpers. The path should reuse `aiSetupChecklistFromState`, `aiExecutionReadinessFromState`, `nextAIGoalDecision`, and `paperCandidateFromValidation` so it stays aligned with existing safety gates. Render it as a status path in `/ai-money` without adding any order execution side effect.

**Tech Stack:** Next.js client component, HeroUI buttons, local ESM tests through `node --test`.

### Task 1: Add Failing Path Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import the new helper**

Add `aiMoneyPathFromState` to the existing import list.

**Step 2: Write the idle path test**

Assert `aiMoneyPathFromState({ analysis: null, validationRuns: [], runs: [], dailyRadarStatus })` returns:
- `stage === "idle"`
- first step is current and action kind is `scan_today`
- all later steps are pending or blocked
- next action tells the user to run AI scanning

**Step 3: Write the paper-ready path test**

Build analysis with context, one strong validation run, one safe backend execution snapshot, and `sentiment_review` done. Assert:
- `stage === "paper_ready"`
- scan/blueprint/validation/evidence steps are done
- paper step is current with `accept_paper_candidate`
- testnet step is pending or blocked
- summary mentions paper candidate rather than mainnet execution

**Step 4: Verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiMoneyPathFromState` is not exported.

### Task 2: Implement Path Projection

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add path item helpers**

Create small local helpers that return path items with:
- `id`
- `label`
- `status`: `done`, `current`, `blocked`, or `pending`
- `tone`
- `detail`
- optional `actionKind`
- optional `href`

**Step 2: Export `aiMoneyPathFromState`**

Accept:

```js
{
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  runs = [],
  accounts,
  dailyRadarStatus = null,
} = {}
```

Compute:
- `decision`
- `candidate`
- `setup`
- `readiness`
- `ranked`
- `paperWatch`

Return:
- `stage`, `title`, `tone`, `summary`
- `currentStepId`
- `primaryAction`
- `primaryHref`
- `steps`
- `nextActions`

**Step 3: Preserve safety boundaries**

Do not expose a mainnet action. `testnet_ready` may point to the strategy preset, but mainnet remains only a blocker/confirmation note.

**Step 4: Verify GREEN**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Render Path Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper and add UI type**

Import `aiMoneyPathFromState` and add `AIMoneyPathState` / `AIMoneyPathStep` types.

**Step 2: Build path state**

Compute path state beside `moneyBrief`, passing analysis, actions, validation runs, runs, accounts, and daily radar status.

**Step 3: Add `AIMoneyPathPanel`**

Render near the top of the right column before `AIMoneyBriefPanel`:
- stage badge
- concise title and summary
- horizontally wrapping path cards on desktop / vertical cards on mobile
- one safe primary action button reusing existing handlers for scan, run all backtests, accept paper candidate, or open link
- next actions list

**Step 4: Verify typecheck**

Run: `yarn typecheck` from `client/`

Expected: PASS.

### Task 4: Final Verification

**Step 1: Focused unit tests**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

**Step 2: Frontend typecheck**

Run: `yarn typecheck` from `client/`

Expected: PASS.

**Step 3: Whitespace check**

Run: `git diff --check`

Expected: no output.

**Step 4: Browser smoke**

Start the Next dev server and open `/ai-money`. Unauthenticated state should still redirect to `/login?next=%2Fai-money` without runtime errors.
