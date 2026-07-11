# AI Delegation Runbook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact AI delegation runbook that tells the operator what AI can safely do now, what still needs human approval, and which single action should happen next.

**Architecture:** Derive a new frontend-only state object from existing AI analysis, persisted action, validation, and account context. Render it near the top of `/ai-money` so the operator sees the AI/human handoff before deeper evidence panels. The feature must not enable live trading, submit orders, or bypass existing gates.

**Tech Stack:** Next.js client component, plain JavaScript helper module, Node test runner, TypeScript typecheck, existing HeroUI/Tailwind UI primitives.

## Task 1: Add Failing Runbook Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import the desired helper**

Add `aiDelegationRunbookFromState` to the existing import list from `./ai-goal-preset.mjs`.

**Step 2: Add behavior tests**

Append four tests near the other AI Money state helpers:

```js
test("aiDelegationRunbookFromState starts idle users with an AI-first handoff", () => {
  const runbook = aiDelegationRunbookFromState();

  assert.equal(runbook.stage, "handoff");
  assert.equal(runbook.primaryAction.kind, "scan_today");
  assert.ok(runbook.aiSteps.some((item) => item.title.includes("扫描")));
  assert.ok(runbook.humanSteps.some((item) => item.title.includes("目标")));
  assert.ok(runbook.guardrails.some((item) => item.includes("不会下单")));
});

test("aiDelegationRunbookFromState delegates runnable drafts to AI validation", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_validate",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 1 },
      strategyDrafts: [
        { name: "btca", kind: "grid_dca", symbol: "BTC", params: {} },
        { name: "watch", kind: "watch_only", symbol: "ETH", params: {} },
      ],
      watchSignals: [],
      humanFactors: [],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [],
  });

  assert.equal(runbook.stage, "ai_validate");
  assert.equal(runbook.primaryAction.kind, "run_all_backtests");
  assert.ok(runbook.aiSteps.some((item) => item.detail.includes("1 个")));
  assert.ok(runbook.decision.includes("回测"));
});

test("aiDelegationRunbookFromState keeps hot candidates at human review", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_hot",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: ["FOMO 追涨风险上升"],
      watchSignals: [{ signal: "社媒热度过热", source: "news", interpretation: "叙事拥挤", action: "降速" }],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: [] },
    },
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(runbook.stage, "human_review");
  assert.equal(runbook.primaryAction.kind, "open_link");
  assert.ok(runbook.humanSteps.some((item) => item.detail.includes("FOMO")));
  assert.ok(runbook.guardrails.some((item) => item.includes("paper")));
});

test("aiDelegationRunbookFromState hands clean candidates to paper adoption", () => {
  const runbook = aiDelegationRunbookFromState({
    analysis: {
      id: "run_clean",
      context: { notes: [], newsCount: 4, macroCount: 1, onchainCount: 2 },
      humanFactors: [],
      watchSignals: [],
      strategyDrafts: [{ name: "btca", kind: "grid_dca", symbol: "BTC", params: {} }],
      execution: { mode: "paper", safetyGates: ["组合限额已配置"] },
    },
    persistedActions: [{ id: "sentiment_review", status: "done", updatedAt: "2026-06-03T08:00:00.000Z" }],
    validationRuns: [
      {
        runId: "run_btc",
        strategyId: "btca",
        state: 3,
        metrics: { total_return: 0.12, sharpe: 1.8, max_dd: -0.06, n_trades: 24 },
      },
    ],
  });

  assert.equal(runbook.stage, "paper_handoff");
  assert.equal(runbook.primaryAction.kind, "accept_paper_candidate");
  assert.ok(runbook.aiSteps.some((item) => item.title.includes("paper")));
  assert.ok(runbook.humanSteps.some((item) => item.title.includes("采用")));
});
```

**Step 3: Run test to verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiDelegationRunbookFromState` is not exported.

## Task 2: Implement Runbook Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add small helper**

Add an internal helper:

```js
function delegationStep(owner, title, detail, status = "pending") {
  return { owner, title, detail, status };
}
```

**Step 2: Export `aiDelegationRunbookFromState`**

Place it near the other AI Money orchestration helpers. It must accept:

```js
export function aiDelegationRunbookFromState({
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  accounts,
  dailyRadarStatus = null,
} = {}) {
  // derive from existing helpers only
}
```

Required behavior:
- No analysis: stage `handoff`, primary action `scan_today`, AI steps for scanning/generating, human steps for goal/risk input, guardrail that AI will not place orders.
- Data gaps or stale radar: stage `refresh_context`, primary action `scan_today` or `open_link`, AI steps for refreshing context, human steps for reviewing missing data.
- Runnable drafts without validation: stage `ai_validate`, primary action `run_all_backtests`, AI steps mention runnable count.
- Running validation: stage `ai_wait`, primary action `open_link`, AI steps mention polling/waiting.
- Strong candidate with unresolved sentiment/human pressure: stage `human_review`, primary action `open_link`, human steps cite the first human factor or sentiment risk.
- Strong clean candidate before paper adoption: stage `paper_handoff`, primary action `accept_paper_candidate`, AI steps describe prepared paper handoff, human steps require adoption/observation.
- Completed paper watch and execution readiness: stage `testnet_handoff`, primary action `open_link`, guardrails still forbid mainnet automation.

Use existing helpers such as `nextAIGoalDecision`, `aiExecutionReadinessFromState`, `aiSentimentCompassFromAnalysis`, `runnableBacktestRequestsFromAnalysis`, `paperCandidateFromValidation`, and `persistedActionById`.

**Step 3: Run test to verify GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

## Task 3: Render Runbook Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type**

Add `aiDelegationRunbookFromState` to imports. Add local types for:

```ts
type AIDelegationRunbookStep = {
  owner: "AI" | "human" | string;
  title: string;
  detail: string;
  status: string;
};

type AIDelegationRunbookState = {
  stage: string;
  tone: "success" | "warning" | "danger" | "default";
  title: string;
  decision: string;
  primaryAction?: {
    kind: "scan_today" | "run_all_backtests" | "accept_paper_candidate" | "open_link" | string;
    label: string;
    href?: string;
  };
  metrics: Array<{ label: string; value: string | number; hint: string }>;
  aiSteps: AIDelegationRunbookStep[];
  humanSteps: AIDelegationRunbookStep[];
  guardrails: string[];
};
```

**Step 2: Build state**

Add a typed builder and `delegationRunbook` calculation alongside the other `build*` calls:

```ts
const buildDelegationRunbook = aiDelegationRunbookFromState as unknown as (input: {
  analysis?: TypeAIGoalAnalysis | null;
  persistedActions?: TypeAIGoalRunAction[];
  validationRuns?: BacktestValidationRun[];
  accounts?: TypeAccount[];
  dailyRadarStatus?: DailyRadarStatus | null;
}) => AIDelegationRunbookState;
```

**Step 3: Render panel near the top**

Place `<AIDelegationRunbookPanel />` after `AICommandCenterPanel` and before `AIOperatorRhythmPanel`.

Supported actions:
- `scan_today` calls `onDailyRadarScan`.
- `run_all_backtests` calls existing `runAllBacktests(analysis)`.
- `accept_paper_candidate` calls existing `acceptPaperCandidate(candidate)`.
- `open_link` renders a safe relative `<Link>`.

The panel title is `AI 授权执行单`. It shows metrics, AI delegated steps, human approval steps, and guardrails. It must not add any new trading action.

**Step 4: Run verification**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: tests and typecheck pass. Existing unrelated lint warning may remain.

## Task 4: Smoke Test

**Files:**
- No code changes.

**Step 1: Start dev server**

Run:

```bash
cd client && yarn dev --hostname 127.0.0.1 --port 3000
```

**Step 2: Verify route**

Run:

```bash
curl -sS -I http://127.0.0.1:3000/ai-money
curl -sS -I 'http://127.0.0.1:3000/login?next=%2Fai-money'
```

Expected:
- `/ai-money` redirects to `/login?next=%2Fai-money` when unauthenticated.
- Login page returns `200 OK`.

**Step 3: Stop dev server and confirm port released**

Run:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Expected: no listening process after server shutdown.

## Task 5: Final Review

**Files:**
- Update: `docs/plans/2026-06-03-ai-delegation-runbook.md`

Append task progress and final review:
- Confirm RED/GREEN evidence.
- Confirm no execution path changed.
- Confirm the runbook only exposes safe existing actions.

## Task Progress

### 2026-06-03 02:05:54 CST

- Step: Task 1 - Add failing runbook tests.
- Modifications: Added `aiDelegationRunbookFromState` import and four behavior tests in `client/data/ai-goal-preset.test.mjs`.
- Change Summary: Covered idle handoff, AI validation delegation, human review for heated candidates, and clean paper handoff.
- Reason: Executing plan Task 1 with TDD.
- Blockers: None. RED was confirmed by the missing `aiDelegationRunbookFromState` export.
- User Confirmation Status: Pending Confirmation.

### 2026-06-03 02:05:54 CST

- Step: Task 2 - Implement runbook helper.
- Modifications: Added `delegationStep`, `delegationMetrics`, and exported `aiDelegationRunbookFromState` in `client/data/ai-goal-preset.mjs`.
- Change Summary: AI now produces a compact runbook that separates AI-delegated work from human approvals and keeps guardrails visible.
- Reason: Executing plan Task 2.
- Blockers: None. Target Node test passed with 112 tests.
- User Confirmation Status: Pending Confirmation.

### 2026-06-03 02:05:54 CST

- Step: Task 3 - Render runbook panel.
- Modifications: Updated `client/app/(dashboard)/ai-money/client.tsx` to import the helper, define local types, compute `delegationRunbook`, and render `AIDelegationRunbookPanel` after the AI command center.
- Change Summary: `/ai-money` now shows `AI 授权执行单` near the top of the workflow with safe scan, backtest, paper-adoption, and evidence-link actions.
- Reason: Executing plan Task 3.
- Blockers: None.
- User Confirmation Status: Pending Confirmation.

### 2026-06-03 02:05:54 CST

- Step: Task 4 - Verification and smoke.
- Modifications: Removed one new unused variable caught by lint; no behavioral changes from verification.
- Change Summary: Target and regression tests passed; local smoke confirmed `/ai-money` redirects to login and login returns 200. Browser plugin could not directly access localhost due its local URL policy, so authorized HTTP smoke was used.
- Reason: Executing plan Task 4.
- Blockers: Existing lint warning remains in `client/data/use-activity-center.tsx:138`.
- User Confirmation Status: Pending Confirmation.

## Final Review

Implementation matches the final plan. The new runbook is a frontend orchestration and visibility layer only. It does not add backend routes, live trading toggles, order submission, mainnet permission, or any execution bypass. The panel maps only to existing safe actions: AI scan, batch backtest, paper candidate adoption, and safe relative links.
