# AI Money Path Paper Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the AI Money path display aligned with the paper review evidence gate, so a thin `paper_watch` completion does not visually advance the workflow past Paper observation.

**Architecture:** Update the pure `aiMoneyPathFromState` helper in `client/data/ai-goal-preset.mjs` to use the existing `paperWatchCompletionHasEvidence` helper. Add a focused test proving the path stays on the Paper step when completion evidence is missing.

**Tech Stack:** ESM `node --test` helper tests, existing AI Money path state, no UI component changes required.

### Task 1: Add failing path consistency test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Add test**

Add near existing `aiMoneyPathFromState` tests:

```js
test("aiMoneyPathFromState keeps paper current when completion lacks review evidence", () => {
  const path = aiMoneyPathFromState({
    analysis: {
      context: {
        newsCount: 2,
        macroCount: 1,
        onchainCount: 1,
        notes: [],
        execution: {
          accountCount: 1,
          tradeableAccountCount: 1,
          withdrawalEnabledAccountCount: 0,
          tradingHalted: false,
          portfolioLimits: {
            maxOpenNotionalUsd: 1000,
            maxOpenPositionsCount: 3,
            maxDailyLossUsd: 100,
          },
        },
      },
      execution: { mode: "paper", safetyGates: ["回测完成", "人工复核"] },
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      humanFactors: ["避免 FOMO 追涨"],
      strategyDrafts: [
        {
          name: "btca",
          kind: "grid_dca",
          symbol: "BTCUSDT",
          params: {},
          riskCaps: { maxPositionUsd: 200, maxLeverage: 3, dailyLossCapUsd: 20 },
        },
      ],
    },
    persistedActions: [
      { id: "sentiment_review", status: "done" },
      { id: "paper_watch", status: "done", href: "/backtests/run_btc", note: "Paper 已完成" },
    ],
    validationRuns: [
      {
        id: "run_btc",
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        progress: 100,
        metrics: { total_return: 0.12, sharpe: 1.5, max_dd: -0.04, n_trades: 30 },
      },
    ],
  });
  const stepById = Object.fromEntries(path.steps.map((step) => [step.id, step]));

  assert.equal(path.stage, "paper_watch");
  assert.equal(path.currentStepId, "paper");
  assert.equal(stepById.paper.status, "current");
  assert.equal(stepById.paper.actionKind, "open_link");
  assert.equal(stepById.paper.href, "/backtests/run_btc");
  assert.ok(stepById.paper.detail.includes("复盘证据不足"));
  assert.equal(stepById.testnet.status, "blocked");
});
```

**Step 2: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because the paper step is currently marked `done` and current step falls through to testnet.

### Task 2: Implement path evidence alignment

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Compute evidence state**

Inside `aiMoneyPathFromState`, after `paperWatch`, add:

```js
const paperEvidenceComplete =
  paperWatch?.status === "done" && paperWatchCompletionHasEvidence(paperWatch);
```

**Step 2: Update paper/testnet statuses**

Use `paperEvidenceComplete`, not just `paperWatch.status === "done"`, to mark the Paper step done. If `paperWatch` exists but evidence is incomplete, set Paper to `current` and add an `open_link` action.

**Step 3: Verify GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

### Task 3: Verify broader frontend

Run:

```bash
yarn typecheck
yarn lint
```

Expected: typecheck passes; lint exits 0 with only the known unrelated `use-activity-center.tsx` warning.

Smoke `/ai-money`:

```bash
yarn dev --hostname 127.0.0.1 --port 3000
curl -L -sS -I http://127.0.0.1:3000/ai-money
```

Expected: final HTTP 200 after auth redirect. Stop dev server and confirm port 3000 is free.

Implementation Checklist:
1. Add RED path consistency test.
2. Run focused tests and confirm RED.
3. Add `paperEvidenceComplete` to `aiMoneyPathFromState`.
4. Update Paper step status/detail/action.
5. Update testnet status to depend on full evidence.
6. Run focused tests and confirm GREEN.
7. Run `yarn typecheck`.
8. Run `yarn lint`.
9. Smoke `/ai-money` locally and stop dev server.
