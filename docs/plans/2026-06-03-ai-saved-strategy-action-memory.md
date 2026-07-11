# AI Saved Strategy Action Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When an AI-generated strategy draft is saved, persist a richer action handoff into the AI goal run so later AI analysis knows the saved strategy is still stopped and must continue through backtest, paper observation, and safety gates.

**Architecture:** Add one pure helper in `client/data/ai-goal-preset.mjs` that converts a saved draft and create response into the `strategy` action patch. Wire `saveStrategyDraft` to use the helper instead of an inline generic note. Cover the helper with node tests before implementation.

**Tech Stack:** Next.js client code, TypeScript call sites, ESM helper tests with `node --test`.

### Task 1: Add the failing helper test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import the helper**

Add `strategyActionPatchFromSavedDraft` to the existing import list from `./ai-goal-preset.mjs`.

**Step 2: Write the failing test**

Add a test near the existing `optionPayloadFromStrategyDraft` and saved strategy handoff tests:

```js
test("strategyActionPatchFromSavedDraft writes a saved AI strategy handoff into run memory", () => {
  const patch = strategyActionPatchFromSavedDraft({
    analysis: {
      id: "goal abc",
      goal: "用 BTC 低回撤赚钱",
    },
    draft: {
      name: "btca",
      symbol: "BTC",
      kind: "grid_dca",
      hypothesis: "BTC range-bound grid after sentiment cools",
    },
    response: {
      value: {
        id: "opt123",
        name: "btca",
      },
    },
    href: "/strategies/opt123?from=ai-draft&aiRunId=goal+abc",
  });

  assert.equal(patch.status, "done");
  assert.equal(patch.relatedId, "opt123");
  assert.equal(patch.href, "/strategies/opt123?from=ai-draft&aiRunId=goal+abc");
  assert.ok(patch.note.includes("btca"));
  assert.ok(patch.note.includes("goal abc"));
  assert.ok(patch.note.includes("live 仍关闭"));
  assert.ok(patch.note.includes("回测"));
  assert.ok(patch.note.includes("paper"));
  assert.ok(patch.note.includes("市场风向"));
});
```

**Step 3: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: fail because `strategyActionPatchFromSavedDraft` is not exported.

### Task 2: Implement the helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add compact text helpers if needed**

Use local string cleanup only. Do not add dependencies.

**Step 2: Export `strategyActionPatchFromSavedDraft`**

Place it after `optionPayloadFromStrategyDraft` so strategy-save helpers remain grouped:

```js
export function strategyActionPatchFromSavedDraft({
  analysis = null,
  draft = null,
  response = null,
  href = "",
} = {}) {
  const savedId = String(response?.value?.id || response?.value?.name || draft?.name || "").trim();
  const name = String(response?.value?.name || draft?.name || "AI 策略").trim();
  const runId = String(analysis?.id || "").trim();
  const goal = String(analysis?.goal || "").trim();
  const symbol = String(draft?.symbol || draft?.params?.execSymbol || "").trim();
  const hypothesis = String(draft?.hypothesis || draft?.rationale || "").trim();
  const detailParts = [
    `${name} 已保存为 AI 策略配置`,
    runId ? `来源 AI run ${runId}` : "",
    goal ? `目标：${goal}` : "",
    symbol ? `标的：${symbol}` : "",
    hypothesis ? `假设：${hypothesis}` : "",
    "live 仍关闭",
    "下一步必须先补回测证据，再进入 paper 观察",
    "paper 中继续记录市场风向、舆论变化、人性偏差和真实执行摩擦",
    "未完成安全账户、风控和测试网检查前不进入主网",
  ].filter(Boolean);

  return {
    status: "done",
    relatedId: savedId,
    ...(href ? { href } : {}),
    note: detailParts.join("；"),
  };
}
```

Keep the final code compact and robust to missing fields.

**Step 3: Verify GREEN**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: all tests pass.

### Task 3: Wire the AI Money save flow

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import the helper**

Add `strategyActionPatchFromSavedDraft` to the existing import from `@/data/ai-goal-preset.mjs`.

**Step 2: Replace inline generic strategy action patch**

Inside `saveStrategyDraft`, after `href` is computed, build:

```ts
const strategyActionPatch = strategyActionPatchFromSavedDraft({
  analysis,
  draft,
  response,
  href,
}) as TypeAIGoalRunActionPatch;
```

Then pass `strategyActionPatch` to `updateAIGoalRunAction(analysis.id, "strategy", strategyActionPatch)`.

**Step 3: Preserve existing behavior**

Keep `createOption(payload)`, activity tracking, active run update, run list update, and `router.push(href)` unchanged.

### Task 4: Verify and document

**Files:**
- Verify: `client/data/ai-goal-preset.test.mjs`
- Verify: `client`
- Verify: `docs/plans/2026-06-03-ai-saved-strategy-action-memory.md`

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

Run dev server:

```bash
yarn dev --hostname 127.0.0.1 --port 3000
```

Then request:

```bash
curl -L -sS -I http://127.0.0.1:3000/ai-money
```

Expected: HTTP 200 response headers. Stop the dev server afterward.

Implementation Checklist:
1. Add `strategyActionPatchFromSavedDraft` to the test import list.
2. Add the failing saved-strategy action memory test.
3. Run the focused node test and confirm RED.
4. Implement `strategyActionPatchFromSavedDraft` in `client/data/ai-goal-preset.mjs`.
5. Run the focused node test and confirm GREEN.
6. Import and use the helper in `client/app/(dashboard)/ai-money/client.tsx`.
7. Run focused node tests again.
8. Run `yarn typecheck`.
9. Run `yarn lint`.
10. Smoke `/ai-money` locally and stop the dev server.
