# AI Setup Checklist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI setup checklist that tells the operator what must be configured before the AI money workflow is usable.

**Architecture:** Put the decision logic in `client/data/ai-goal-preset.mjs` so it can be tested with existing Node tests. Render the result in `client/app/(dashboard)/ai-money/client.tsx` near the top of the AI Money page, reusing existing actions and UI primitives.

**Tech Stack:** Next.js App Router, React 19, HeroUI, plain ESM helper tests with `node --test`.

### Task 1: Add Helper Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests for `aiSetupChecklistFromState`:
- It returns `stage: "blocked"` when AI falls back, context data is missing, and there is no safe account.
- It returns `stage: "ready"` with a high score when AI status is ok, context exists, one safe account exists, risk limits are set, and a completed validation run exists.

**Step 2: Verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiSetupChecklistFromState` is not exported yet.

### Task 2: Implement Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add `aiSetupChecklistFromState(input)`**

The helper returns:
- `stage`, `tone`, `score`, `title`, `summary`
- `primaryHref`, `primaryAction`
- `items: [{ id, label, status, tone, detail, href? }]`
- `nextActions`

It checks provider, context evidence, strategy blueprint, validation, safe account, risk limits, and execution gate.

**Step 2: Verify GREEN**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Render Page Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper result**

Add `aiSetupChecklistFromState` to imports and define compact TypeScript types matching the helper output.

**Step 2: Build and render panel**

Compute `setupChecklist` from the active analysis, validation runs, accounts, and daily radar status. Render `AISetupChecklistPanel` above the goal form, with existing scan, backtest, and link actions.

### Task 4: Verify

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `git diff --check`

If the frontend panel changes significantly, smoke the protected route in the in-app browser or document why only the login redirect is reachable.
