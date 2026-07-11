# AI Paper Watch Evidence Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI Money from treating paper observation as complete unless the saved AI run memory contains evidence that market direction, sentiment, human bias, paper window, and execution friction were reviewed.

**Architecture:** Add a small pure evidence helper in `client/data/ai-goal-preset.mjs`, specialize the `paper_watch` manual transition note, and make both `aiExecutionReadinessFromState` and `nextAIGoalDecision` require that evidence before moving to testnet candidate states.

**Tech Stack:** ESM helper tests with `node --test`, existing AI Money preset helper module, existing action persistence shape.

### Task 1: Add failing evidence-gate tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Add readiness test**

Add a test near the existing `aiExecutionReadinessFromState` tests. The test should pass a completed backtest, a tradeable account, portfolio limits, and `paper_watch` with `status: "done"` but a generic note such as `"Paper 已完成"`.

Expected:
- `readiness.stage` is `"paper_watch"`.
- `readiness.blockers` contains `"paper 复盘证据不足"`.
- `readiness.primaryAction` remains `{ kind: "open_link", label: "查看 paper 观察" }`.

**Step 2: Add transition-note test**

Update the existing `manualActionTransition` expectation for `paper_watch` manual status so it expects:
- `label: "完成 paper 复盘"`
- `nextStatus: "done"`
- A note containing `"24-72"`, `"市场风向"`, `"舆论"`, `"人性偏差"`, `"执行摩擦"`, and `"不进入主网"`.

**Step 3: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because generic `paper_watch` done currently advances to `testnet_ready` and the transition note is still generic.

### Task 2: Implement paper evidence helper and transition note

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add near `persistedActionById`:

```js
function paperWatchCompletionHasEvidence(action) {
  const note = String(action?.note || "").toLowerCase();
  if (!note) return false;
  const groups = [
    ["24-72", "24h", "72h", "观察"],
    ["市场风向", "market"],
    ["舆论", "sentiment", "情绪"],
    ["人性偏差", "fomo", "behavior"],
    ["执行摩擦", "滑点", "friction"],
  ];
  return groups.every((items) => items.some((item) => note.includes(item.toLowerCase())));
}
```

**Step 2: Specialize `manualActionTransition`**

Before the generic manual return, add a special case for `id === "paper_watch"` and non-done status:

```js
return {
  label: "完成 paper 复盘",
  nextStatus: "done",
  note: "Paper 观察已完成 24-72 小时复盘：已检查市场风向、舆论变化、人性偏差、执行摩擦和回撤表现；只允许进入测试网前检查，不进入主网。",
};
```

Keep the existing done -> manual branch unchanged.

**Step 3: Wire readiness gate**

In `aiExecutionReadinessFromState`, when `paperWatch.status === "done"`, call `paperWatchCompletionHasEvidence(paperWatch)`.

If false:
- Push blocker `"paper 复盘证据不足：需要记录市场风向、舆论、人性偏差和执行摩擦。"`
- Do not push `"paper 观察已标记完成。"`
- Treat the stage like `paper_watch`, not `testnet_ready`.

**Step 4: Wire decision gate**

In `nextAIGoalDecision`, treat `paper_watch` as incomplete unless `paperWatchCompletionHasEvidence(paperWatch)` is true. The missing-evidence case should stay at `stage: "paper_watch"` with a summary explaining that the paper observation was marked done but lacks review evidence.

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

Expected: exit 0. Known unrelated `use-activity-center.tsx` warning may remain.

**Step 4: Smoke `/ai-money`**

Run:

```bash
yarn dev --hostname 127.0.0.1 --port 3000
curl -L -sS -I http://127.0.0.1:3000/ai-money
```

Expected: final HTTP 200 after auth redirect. Stop the dev server and confirm port 3000 is free.

Implementation Checklist:
1. Add readiness test for completed paper watch without evidence.
2. Update `manualActionTransition` paper-watch expectation.
3. Run focused tests and confirm RED.
4. Add `paperWatchCompletionHasEvidence`.
5. Specialize `manualActionTransition` for `paper_watch`.
6. Wire evidence gate into `aiExecutionReadinessFromState`.
7. Wire evidence gate into `nextAIGoalDecision`.
8. Run focused tests and confirm GREEN.
9. Run `yarn typecheck`.
10. Run `yarn lint`.
11. Smoke `/ai-money` locally and stop dev server.
