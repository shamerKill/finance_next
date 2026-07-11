# AI Saved Strategy Followup Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI follow-up queue surface saved AI strategies that still need backtest and paper observation, instead of treating them as generic unsaved blueprints.

**Architecture:** Extend `aiRunFollowupQueueFromRuns` through its private `aiRunFollowupItem` helper. When the run has a completed `strategy` action and no active `paper_watch` or `backtest` action, emit a high-priority saved-strategy follow-up item that links to the saved strategy handoff page and reminds the user to run backtest, paper watch, and safety checks.

**Tech Stack:** ESM helper code in `client/data/ai-goal-preset.mjs`, Node test runner in `client/data/ai-goal-preset.test.mjs`.

### Task 1: Add the failing test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add this test after the existing paper-watch follow-up queue test:

```js
test("aiRunFollowupQueueFromRuns prioritizes saved AI strategies that still need backtest", () => {
  const queue = aiRunFollowupQueueFromRuns(
    [
      {
        id: "goal_saved",
        goal: "BTC 低回撤赚钱路径",
        symbols: ["BTC"],
        aiStatus: "ok",
        executionMode: "paper",
        strategyDraftCount: 2,
        contextNewsCount: 3,
        contextMacroCount: 1,
        contextOnchainCount: 1,
        createdAt: "2026-06-03T02:00:00.000Z",
        actions: [
          {
            id: "strategy",
            status: "done",
            relatedId: "opt123",
            href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
            note: "btca 已保存为 AI 策略配置；live 仍关闭；下一步必须先补回测证据，再进入 paper 观察；paper 中继续记录市场风向。",
          },
        ],
      },
    ],
    new Date("2026-06-03T04:00:00.000Z"),
  );

  assert.equal(queue.stage, "needs_attention");
  assert.equal(queue.primaryAction.kind, "open_run");
  assert.equal(queue.primaryAction.runId, "goal_saved");
  assert.equal(queue.items[0].actionKind, "saved_strategy_backtest");
  assert.equal(queue.items[0].href, "/strategies/opt123?from=ai-draft&aiRunId=goal_saved");
  assert.ok(queue.items[0].detail.includes("已保存"));
  assert.ok(queue.items[0].detail.includes("回测"));
  assert.ok(queue.items[0].detail.includes("paper"));
  assert.ok(queue.nextActions[0].includes("已保存策略"));
});
```

**Step 2: Run test to verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the new test fails because `aiRunFollowupQueueFromRuns` currently ignores completed `strategy` actions.

### Task 2: Implement saved strategy follow-up detection

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add completed strategy lookup**

Inside `aiRunFollowupItem`, after the current `strategy` lookup, add:

```js
const savedStrategy = persistedActionById(run?.actions, "strategy");
const savedStrategyDone = String(savedStrategy?.status || "").toLowerCase() === "done" ? savedStrategy : null;
```

**Step 2: Emit saved strategy follow-up before stale-context handling**

After the `refreshed?.status === "done"` block and before stale/thin context handling, add a branch:

```js
if (savedStrategyDone) {
  return {
    ...base,
    priority: 78,
    tone: "warning",
    actionKind: "saved_strategy_backtest",
    title: "已保存策略待回测",
    detail:
      savedStrategyDone.note ||
      `${goal} 已保存为策略配置，下一步先补回测证据，再进入 paper 观察和安全闸门。`,
    href: savedStrategyDone.href || aiMoneyRunHref(runId),
  };
}
```

Keep this below active `paper_watch`, active `backtest`, active `strategy`, and completed refresh so those more specific states still win.

**Step 3: Update next action wording**

In the `nextActions` mapper inside `aiRunFollowupQueueFromRuns`, add:

```js
if (item.actionKind === "saved_strategy_backtest") return `已保存策略补回测：${item.goal}`;
```

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

Expected: route responds with final HTTP 200 after the auth redirect. Stop the dev server and confirm no listener remains on port 3000.

Implementation Checklist:
1. Add the saved-strategy follow-up queue test.
2. Run focused tests and confirm RED.
3. Implement completed `strategy` action detection in `aiRunFollowupItem`.
4. Update follow-up queue `nextActions` wording.
5. Run focused tests and confirm GREEN.
6. Run `yarn typecheck`.
7. Run `yarn lint`.
8. Smoke `/ai-money` locally and stop the dev server.
