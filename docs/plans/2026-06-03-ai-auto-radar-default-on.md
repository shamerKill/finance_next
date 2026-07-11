# AI Auto Radar Default On Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money more autonomous by enabling the daily AI radar by default on first use while preserving an explicit user opt-out.

**Architecture:** Add a small pure helper in `client/data/ai-goal-preset.mjs` to parse the persisted auto-radar preference. Missing or unknown preference values return the safe default `true`; explicit `"false"` returns `false`. The UI continues to use `autoDailyRadarDecision`, so automatic work remains limited to analysis and validation.

**Tech Stack:** Next.js client component, existing AI Money helper module, Node test runner.

### Task 1: RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Import `AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED` and `autoDailyRadarEnabledFromStorage`.

Add a test asserting:

```js
assert.equal(AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED, true);
assert.equal(autoDailyRadarEnabledFromStorage(null), true);
assert.equal(autoDailyRadarEnabledFromStorage(""), true);
assert.equal(autoDailyRadarEnabledFromStorage("true"), true);
assert.equal(autoDailyRadarEnabledFromStorage("false"), false);
```

**Step 2: Verify RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs --test-name-pattern "autoDailyRadarEnabledFromStorage"
```

Expected: FAIL because the helper is not exported yet.

### Task 2: Helper Implementation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

Add:

```js
export const AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED = true;

export function autoDailyRadarEnabledFromStorage(value, fallback = AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return Boolean(fallback);
}
```

### Task 3: UI Wiring

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

Import `autoDailyRadarEnabledFromStorage`.

In the mount effect that reads `AUTO_DAILY_RADAR_ENABLED_KEY`, replace the current strict `"true"` comparison with the helper:

```ts
enabled = parseAutoRadarEnabled(window.localStorage.getItem(AUTO_DAILY_RADAR_ENABLED_KEY));
```

Keep `autoRadarEnabled` initial state as `false` so the page waits for preference loading before triggering the auto scan; the helper only changes the loaded default.

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: all pass; the known `client/data/use-activity-center.tsx:138` lint warning may remain.

Implementation Checklist:
1. Add RED test for default auto-radar preference parsing.
2. Implement the exported default and parser helper.
3. Wire AI Money localStorage preference loading to the parser.
4. Run full verification.

## Task Progress

* 2026-06-03 11:27:54 CST
  * Step: 1-3. Default daily AI radar to enabled while preserving opt-out.
  * Modifications: Updated `client/data/ai-goal-preset.test.mjs`, `client/data/ai-goal-preset.mjs`, and `client/app/(dashboard)/ai-money/client.tsx`.
  * Change Summary: Added a pure preference parser so missing auto-radar preference values enable the safe daily radar, while an explicit `"false"` remains disabled.
  * Reason: Executing plan steps 1-3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

* 2026-06-03 11:28:41 CST
  * Step: 4. Run full verification.
  * Modifications: Ran the full AI helper test set, frontend typecheck, frontend lint, and diff whitespace check.
  * Change Summary: Verification passed; lint keeps the known unrelated `client/data/use-activity-center.tsx:138` warning.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. First-use AI Money sessions now default the daily radar to enabled through `autoDailyRadarEnabledFromStorage(null) === true`, while an explicit stored `"false"` still disables it. The existing `autoDailyRadarDecision` guard still blocks duplicate runs, busy runs, and fresh daily radar runs; no order execution, testnet, or mainnet gate was relaxed.

Verification passed:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

`yarn lint` exits 0 with the existing warning in `client/data/use-activity-center.tsx:138`.
