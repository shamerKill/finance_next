# AI Saved Strategy Backtest Prefill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the saved AI strategy handoff open a fully prefilled backtest form so the operator can run validation without manually re-entering symbol, params, or window.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that converts a saved `TypeOption` into the existing `/backtests/new` preset query contract. Use it inside `aiSavedStrategyHandoffFromState` whenever no backtest exists yet.

**Tech Stack:** ESM helper code, existing Next.js backtest form query params, Node test runner.

### Task 1: Add failing tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `savedStrategyBacktestHrefFromOption` to the existing import list.

**Step 2: Test the helper**

Add a test near the saved strategy handoff tests:

```js
test("savedStrategyBacktestHrefFromOption builds a prefilled 90 day backtest link", () => {
  const href = savedStrategyBacktestHrefFromOption({
    id: "opt123",
    name: "btca",
    execSymbol: "BTCUSDT",
    positionLevel: 4,
    orderGroupMargin: 300,
    stopProfitRate: 0.04,
    stopLossRate: 0.08,
    profitRateAfterAtAddPosition: 0.01,
    createCostOrderInProfit: true,
    createPositions: [{ marginRate: 1, lossAddRate: 0 }],
  });

  const url = new URL(href, "http://local.test");
  assert.equal(url.pathname, "/backtests/new");
  assert.equal(url.searchParams.get("strategyId"), "opt123");
  assert.equal(url.searchParams.get("symbol"), "BTCUSDT");
  assert.equal(url.searchParams.get("lookbackDays"), "90");
  const proposed = JSON.parse(url.searchParams.get("proposed"));
  assert.equal(proposed.positionLevel, 4);
  assert.equal(proposed.stopProfitRate, 0.04);
  assert.deepEqual(proposed.createPositions, [{ marginRate: 1, lossAddRate: 0 }]);
});
```

**Step 3: Test handoff uses prefilled link**

Extend the existing `aiSavedStrategyHandoffFromState keeps saved AI drafts stopped...` test so `handoff.primaryHref` is parsed and asserted:

```js
const backtestUrl = new URL(handoff.primaryHref, "http://local.test");
assert.equal(backtestUrl.searchParams.get("strategyId"), "opt123");
assert.equal(backtestUrl.searchParams.get("symbol"), "BTCUSDT");
assert.equal(backtestUrl.searchParams.get("lookbackDays"), "90");
assert.ok(backtestUrl.searchParams.get("proposed").includes("positionLevel"));
```

**Step 4: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because the helper is not exported and the handoff link is currently only `/backtests/new?strategyId=opt123`.

### Task 2: Implement helper and wire it into handoff

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add `savedStrategyBacktestParamsFromOption`**

Create a local helper that returns only the backtest param JSON:

```js
function savedStrategyBacktestParamsFromOption(strategy) {
  return {
    positionLevel: Number(strategy?.positionLevel || 0),
    orderGroupMargin: Number(strategy?.orderGroupMargin || 0),
    stopProfitRate: Number(strategy?.stopProfitRate || 0),
    stopLossRate: Number(strategy?.stopLossRate || 0),
    profitRateAfterAtAddPosition: Number(strategy?.profitRateAfterAtAddPosition || 0),
    createCostOrderInProfit: Boolean(strategy?.createCostOrderInProfit),
    createPositions: Array.isArray(strategy?.createPositions) ? strategy.createPositions : [],
  };
}
```

**Step 2: Export `savedStrategyBacktestHrefFromOption`**

Add:

```js
export function savedStrategyBacktestHrefFromOption(strategy) {
  const id = String(strategy?.id || strategy?.name || "").trim();
  const symbol = String(strategy?.execSymbol || "").trim();
  const qs = new URLSearchParams();
  if (id) qs.set("strategyId", id);
  if (symbol) qs.set("symbol", symbol);
  qs.set("proposed", JSON.stringify(savedStrategyBacktestParamsFromOption(strategy)));
  qs.set("lookbackDays", "90");
  const query = qs.toString();
  return query ? `/backtests/new?${query}` : "/backtests/new";
}
```

**Step 3: Use helper in `aiSavedStrategyHandoffFromState`**

Change the fallback `backtestHref` for missing backtests from `/backtests/new?strategyId=...` to `savedStrategyBacktestHrefFromOption(strategy)` when a strategy id/name exists.

### Task 3: Verify

**Files:**
- Verify: `client/data/ai-goal-preset.test.mjs`
- Verify: `client`

**Step 1: Run focused tests**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

**Step 2: Run frontend typecheck**

Run:

```bash
yarn typecheck
```

Expected: pass.

**Step 3: Run frontend lint**

Run:

```bash
yarn lint
```

Expected: exit 0. The known unrelated warning in `client/data/use-activity-center.tsx` may remain.

**Step 4: Smoke `/ai-money`**

Run dev server and request `/ai-money`:

```bash
yarn dev --hostname 127.0.0.1 --port 3000
curl -L -sS -I http://127.0.0.1:3000/ai-money
```

Expected: route responds with final HTTP 200 after auth redirect. Stop the dev server and confirm no listener remains on port 3000.

Implementation Checklist:
1. Add `savedStrategyBacktestHrefFromOption` to test imports.
2. Add helper test for prefilled 90 day backtest link.
3. Extend saved strategy handoff test to assert prefilled link params.
4. Run focused tests and confirm RED.
5. Implement saved strategy backtest href helper.
6. Wire `aiSavedStrategyHandoffFromState` to use the helper.
7. Run focused tests and confirm GREEN.
8. Run `yarn typecheck`.
9. Run `yarn lint`.
10. Smoke `/ai-money` locally and stop the dev server.
