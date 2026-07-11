# AI Market Watchtower Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI market watchtower that turns market context, sentiment, human-bias signals, and validation state into a single observable checklist for the operator.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that derives watch stage, priority signals, stop rules, and a safe primary action from existing AI goal state. The AI Money page renders that state as a compact panel between the daily mission and sentiment compass. This does not change strategy creation, backtest submission, live toggles, or trading execution.

**Tech Stack:** Next.js/React frontend, TypeScript, Node test runner.

### Task 1: Watchtower Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing tests**

Add tests for `aiMarketWatchtowerFromState`:

- Without analysis, it asks for today's AI scan and exposes market/news, macro, and onchain observation lanes.
- With context notes, it blocks on data gaps and turns notes into high-severity signals.
- With a paper candidate and heated sentiment, it stays in sentiment review and surfaces human/sentiment risks before adoption.

**Step 2: Run the target test and verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiMarketWatchtowerFromState` is not exported yet.

**Step 3: Implement the helper**

Add:

```js
export function aiMarketWatchtowerFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  dailyRadarStatus = null,
} = {}) { ... }
```

Return shape:

- `stage`, `tone`, `title`, `summary`
- `primaryAction`, optional `primaryHref`
- `metrics: [{ label, value, hint }]`
- `signals: [{ id, label, source, severity, detail, action }]`
- `stopRules: string[]`
- `nextChecks: string[]`

Decision rules:

- No analysis: stage `scan`, tone `warning`, primary action `scan_today`.
- Context notes or no context count: stage `data_gap`, tone `warning`, primary action `rescan_today`, notes become high-severity signals.
- Running backtests: stage `validating`, tone `warning`, include validation signal and existing watch signals.
- Paper candidate with non-balanced sentiment and no completed sentiment review: stage `sentiment_review`, tone `warning`, primary link `/data-explorer/news`.
- Paper candidate after sentiment review: stage `paper_watch`, tone `success`, include stop rules from drawdown/risk gates and watch signals.
- Otherwise: stage follows the next AI decision and keeps execution observational.

### Task 2: AI Money UI Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper and define state types**

Add `aiMarketWatchtowerFromState` to the existing `ai-goal-preset.mjs` import list.

Define `AIMarketWatchtowerState` and `AIMarketWatchSignal` near the other AI panel state types.

**Step 2: Build state and render panel**

Build the watchtower state with `analysis`, `persistedActions`, `validationRuns`, and `dailyRadarStatus`.

Render `<AIMarketWatchtowerPanel />` after `<AIDailyMissionPanel />` and before `<AISentimentCompassPanel />`.

**Step 3: Add compact panel UI**

The panel should show:

- Header with stage badge and primary action/link when available.
- Metrics row for observation focus.
- Signal rows with source and severity badges.
- Stop rules and next checks side by side.

### Task 3: Verification

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
node --test client/data/auth-redirect.test.mjs
cd client
yarn typecheck
yarn lint
cd ../gateway
GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...
cd ..
git diff --check
```

Expected: all tests pass. Existing lint warning in `client/data/use-activity-center.tsx` may remain unchanged.

Smoke:

- Start Next dev server on `127.0.0.1:3000`.
- Verify `/ai-money` redirects unauthenticated users to `/login?next=%2Fai-money`.
- Stop the dev server and verify port 3000 is closed.

Implementation Checklist:
1. Add this implementation plan document.
2. Add failing tests for the market watchtower helper.
3. Run the target Node test and confirm RED.
4. Implement `aiMarketWatchtowerFromState`.
5. Run the target Node test and confirm GREEN.
6. Import helper into AI Money page and add the watchtower state type.
7. Render the market watchtower panel.
8. Run frontend tests, typecheck, lint, Go tests, diff check, and smoke.
9. Review implementation against this plan.
