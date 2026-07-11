# AI Paper Review Coach Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money visibly guide the user through paper observation review evidence instead of hiding the evidence gate inside readiness logic.

**Architecture:** Add a pure `aiPaperReviewCoachFromState` helper in `client/data/ai-goal-preset.mjs` that summarizes paper candidate status, evidence coverage, missing review lanes, and the exact completion note. Render that helper as a compact panel in `client/app/(dashboard)/ai-money/client.tsx`.

**Tech Stack:** Next.js client component, existing `Section` / `StatusBadge` / `PlanList` primitives, ESM `node --test` helper tests.

### Task 1: Add failing helper tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import helper**

Add `aiPaperReviewCoachFromState` to the import list.

**Step 2: Add observing-state test**

Add a test near paper observation tests:

```js
test("aiPaperReviewCoachFromState guides an active paper watch with required evidence lanes", () => {
  const coach = aiPaperReviewCoachFromState({
    analysis: {
      context: { notes: [], newsCount: 3, macroCount: 1, onchainCount: 1 },
      execution: { mode: "paper", safetyGates: ["组合限额"] },
      humanFactors: ["FOMO 追涨"],
      watchSignals: [{ source: "news", signal: "ETF inflows accelerate" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
    },
    persistedActions: [{ id: "paper_watch", status: "manual", href: "/backtests/run_btc" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(coach.stage, "observing");
  assert.equal(coach.primaryHref, "/backtests/run_btc");
  assert.ok(coach.items.some((item) => item.id === "market" && item.status === "missing"));
  assert.ok(coach.items.some((item) => item.id === "human" && item.label.includes("人性")));
  assert.ok(coach.completionNote.includes("24-72"));
  assert.ok(coach.completionNote.includes("执行摩擦"));
});
```

**Step 3: Add evidence-gap test**

Add a test where `paper_watch` is `done` but its note is `"Paper 已完成"`.

Expected:
- `stage` is `"evidence_gap"`.
- `tone` is `"warning"`.
- `missingEvidence` contains labels for market, sentiment, human, and friction.
- `summary` includes `"复盘证据不足"`.

**Step 4: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because `aiPaperReviewCoachFromState` is not exported.

### Task 2: Implement helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add completion note constant**

Create a shared string:

```js
const PAPER_WATCH_COMPLETION_NOTE =
  "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。";
```

Use it in `manualActionTransition`.

**Step 2: Add evidence item helpers**

Add small helpers to classify note evidence for `window`, `market`, `sentiment`, `human`, and `friction`.

**Step 3: Export `aiPaperReviewCoachFromState`**

The helper should return:
- `stage`, `tone`, `title`, `summary`
- `primaryHref`, `primaryAction`
- `candidateLabel`
- `items: [{ id, label, status, tone, detail }]`
- `missingEvidence`
- `completionNote`
- `nextActions`

It should use `paperWatchCompletionHasEvidence` for the final completed state.

### Task 3: Wire UI panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Import `aiPaperReviewCoachFromState`.

**Step 2: Add TypeScript type**

Add `AIPaperReviewCoachState` and item type near the other AI Money state types.

**Step 3: Build state**

Build `paperReviewCoach` from `analysis`, `activeActions`, and `activeValidationRuns`.

**Step 4: Render panel**

Place `<AIPaperReviewCoachPanel state={paperReviewCoach} />` near capital plan / readiness panels.

Panel content:
- Section title `"AI paper 复盘助手"`
- Status badge with `stage`
- Summary and primary link if present
- Grid of evidence lanes
- Missing evidence list and next actions
- Completion note shown in a monospaced or subdued block for easy reference

### Task 4: Verify

**Files:**
- Verify: `client/data/ai-goal-preset.test.mjs`
- Verify: `client`

**Step 1: Focused tests**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

**Step 2: Typecheck**

Run:

```bash
yarn typecheck
```

Expected: pass.

**Step 3: Lint**

Run:

```bash
yarn lint
```

Expected: exit 0. Known unrelated `use-activity-center.tsx` warning may remain.

**Step 4: Smoke `/ai-money`**

Run:

```bash
yarn dev --hostname 127.0.0.1 --port 3000
curl -L -sS -I http://127.0.0.1:3000/ai-money
```

Expected: final HTTP 200 after auth redirect. Stop the dev server and confirm port 3000 is free.

Implementation Checklist:
1. Import `aiPaperReviewCoachFromState` in the test file.
2. Add observing-state helper test.
3. Add evidence-gap helper test.
4. Run focused tests and confirm RED.
5. Add shared paper completion note constant.
6. Implement evidence item helpers.
7. Export `aiPaperReviewCoachFromState`.
8. Run focused tests and confirm GREEN.
9. Import helper in AI Money client.
10. Add client-side state types.
11. Build `paperReviewCoach` state.
12. Render `AIPaperReviewCoachPanel`.
13. Run focused tests.
14. Run `yarn typecheck`.
15. Run `yarn lint`.
16. Smoke `/ai-money` locally and stop dev server.
