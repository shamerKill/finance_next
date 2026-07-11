# AI Testnet Saved Strategy Href Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make testnet handoff reuse the AI-sized strategy link saved during paper adoption.

**Architecture:** `acceptPaperCandidate` persists the sized strategy href into the `strategy` run action. `aiExecutionReadinessFromState` should prefer that persisted href when the path reaches `testnet_ready`, falling back to the raw candidate href only if no saved strategy handoff exists.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing test**

Add a focused test for `aiExecutionReadinessFromState` where:

- analysis draft has raw `riskCaps.maxPositionUsd = 400`
- persisted `strategy` action has href with `orderGroupMargin=200` and `riskMaxPositionUsd=200`
- `paper_watch` is completed with full evidence
- account and portfolio limits are ready

Assert:

- readiness stage is `testnet_ready`
- `readiness.primaryHref` contains `orderGroupMargin=200`
- `readiness.primaryHref` contains `riskMaxPositionUsd=200`
- `readiness.primaryHref` does not contain `riskMaxPositionUsd=400`

**Step 2: Run focused test**

Run: `node --test --test-name-pattern "aiExecutionReadinessFromState reuses saved AI-sized strategy href" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because readiness currently uses the raw candidate href.

### Task 2: Implement Saved Href Priority

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add `savedStrategyHandoffHref(persistedActions, candidate)`:

- Read action `strategy`
- Require href beginning with `/option?`
- Prefer it when `relatedId` is blank or matches candidate strategy/name
- Return empty string otherwise

**Step 2: Use helper in readiness**

In `aiExecutionReadinessFromState`, compute `strategyHandoffHref` and set `primaryHref = strategyHandoffHref || candidate.strategyHref` for `testnet_ready`.

### Task 3: Verify

**Step 1:** Run focused test.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `gateway`: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`.

**Step 4:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 5:** Run `git diff --check`.

### Execution Notes

- RED confirmed with focused readiness test: testnet handoff used the raw candidate href with `riskMaxPositionUsd=400` instead of the saved AI-sized strategy href.
- Added `savedStrategyHandoffHref` and made `aiExecutionReadinessFromState` prefer persisted `strategy.href` when reaching `testnet_ready`.
- This preserves the paper-adopted AI sizing link through the testnet precheck step while keeping all execution gates unchanged.
- Verified with focused tests, AI helper tests, Go handler tests, frontend typecheck, frontend lint, and `git diff --check`.
