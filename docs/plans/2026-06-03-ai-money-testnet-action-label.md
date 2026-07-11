# AI Money Testnet Action Label Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money path show an explicit testnet handoff action when paper review is complete.

**Architecture:** Keep this as a pure state-helper change in `aiMoneyPathFromState`. The route remains the same prefilled strategy link; only the user-facing action label becomes specific to the current `testnet` step.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing test**

Add a test for `aiMoneyPathFromState` with:

- valid analysis context
- one paper-ready backtest
- completed `sentiment_review`
- completed `paper_watch` with full evidence
- one safe tradeable account
- portfolio limits in `analysis.execution`

Assert:

- `path.currentStepId === "testnet"`
- `path.primaryAction` is `{ kind: "open_link", label: "打开测试网前检查" }`
- `path.steps.find(id === "testnet").href` starts with `/option?`

**Step 2: Run focused test**

Run: `node --test --test-name-pattern "aiMoneyPathFromState makes testnet handoff explicit" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the current label is generic.

### Task 2: Implement Label Mapping

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add step-aware primary action label**

In `aiMoneyPathFromState`, when `currentStep.id === "testnet"` and `actionKind === "open_link"`, set the label to `打开测试网前检查`.

Keep other `open_link` labels unchanged.

### Task 3: Verify

**Step 1:** Run focused test.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `gateway`: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`.

**Step 4:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 5:** Run `git diff --check`.

### Execution Notes

- RED confirmed with focused `aiMoneyPathFromState makes testnet handoff explicit` test: current primary action label was the generic `打开相关页面`.
- Added `moneyPathActionLabel` so the current `testnet` step maps `open_link` to `打开测试网前检查` while other open-link steps keep their existing label.
- Verified with focused tests, AI helper tests, Go handler tests, frontend typecheck, frontend lint, and `git diff --check`.
