# AI Execution Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show whether an AI-generated money plan is actually ready to progress from analysis to paper/testnet, and list the missing gates in one operational panel.

**Architecture:** Add a pure client helper that derives readiness from AI analysis, validation backtests, persisted operator actions, and account metadata. The AI Money page fetches accounts and renders a compact readiness panel beside existing sentiment/capital/autopilot panels.

**Tech Stack:** Next.js client component, project API client, Node test runner.

### Task 1: Readiness Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing tests**

Add tests for:
- no tradeable account blocks an otherwise validated paper candidate;
- completed sentiment review, tradeable account, and completed paper watch promote the state to testnet-ready.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: import/function failure because `aiExecutionReadinessFromState` does not exist.

**Step 3: Write minimal implementation**

Export `aiExecutionReadinessFromState()` from `client/data/ai-goal-preset.mjs`. It should return `{stage,tone,score,title,summary,primaryHref,primaryAction,metrics,ready,blockers}`.

**Step 4: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: all helper tests pass.

### Task 2: AI Money Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Wire data**

Import `listAccounts` and `aiExecutionReadinessFromState`, keep `accounts`, `accountsBusy`, and `accountsError` in component state, and refresh accounts on mount.

**Step 2: Render panel**

Add `AIExecutionReadinessPanel` after the capital plan panel. It should show readiness score, blockers, ready gates, and primary action links/buttons for adding accounts, running backtests, adopting paper candidate, or opening the next step.

**Step 3: Typecheck**

Run: `yarn typecheck` from `client/`.

Expected: TypeScript passes.

### Task 3: Verification

**Files:**
- Update: `docs/plans/2026-06-02-ai-execution-readiness.md`

**Step 1: Run checks**

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck` from `client/`
- `git diff --check`

**Step 2: Record outcome**

Append verification results to this plan. Do not stage or commit unless requested.

## Verification Results

- RED helper test: `node --test client/data/ai-goal-preset.test.mjs` failed as expected because `aiExecutionReadinessFromState` was not exported.
- GREEN helper test: `node --test client/data/ai-goal-preset.test.mjs` passed, 58/58 tests.
- TypeScript: `yarn typecheck` passed.
- Browser smoke: opened `http://localhost:3000/ai-money`; unauthenticated flow redirected to `/login?next=%2Fai-money` as expected and page console had 0 application errors.
- Production build: `yarn build` passed with `/ai-money` in the compiled route list. Existing Next/Tailwind warnings remained informational.
- Diff whitespace: `git diff --check` passed.
