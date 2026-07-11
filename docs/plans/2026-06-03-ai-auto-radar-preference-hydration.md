# AI Auto Radar Preference Hydration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the AI Money daily radar defaults to enabled on first use without the first render writing a false opt-out into localStorage before the saved preference is loaded.

**Architecture:** Keep the React initial state conservative to avoid hydration mismatch and premature scanning. Move the persistence gate into a tested pure helper, then have the AI Money page write the auto-radar preference only after the preference hydration effect has completed.

**Tech Stack:** Next.js client component, React hooks, TypeScript, Node test runner for `.mjs` pure helpers.

# Context
Filename: 2026-06-03-ai-auto-radar-preference-hydration.md
Created On: 2026-06-03 11:31:13 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The AI Money auto daily radar was changed to default on for first use, but the page still initializes `autoRadarEnabled` as `false` and has a separate effect that writes that false value to localStorage immediately after mount. This can overwrite an absent first-use preference with an explicit opt-out before the read effect applies the default-on value.

# Project Overview
`finance_next` is a monorepo with a Next.js client and Go gateway. This task is limited to the AI Money frontend flow and the pure helper/test file that already owns AI goal behavior decisions.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
Relevant files:

`client/app/(dashboard)/ai-money/client.tsx` owns the AI Money page state. It currently initializes `autoRadarEnabled` to `false`, reads localStorage in a mount effect, then has another effect that writes `autoRadarEnabled` to localStorage whenever the state changes. Because both effects run after the first render, the write effect can persist `"false"` before the read effect applies the default-on preference.

`client/data/ai-goal-preset.mjs` already contains `AI_MONEY_DEFAULT_AUTO_RADAR_ENABLED` and `autoDailyRadarEnabledFromStorage()`. This is the right place for a small pure persistence decision helper because the existing tests already verify auto-radar defaults and decision behavior.

`client/data/ai-goal-preset.test.mjs` has adjacent tests for `autoDailyRadarDecision` and `autoDailyRadarEnabledFromStorage()`. The new behavior should be expressed there first as a failing test.

# Proposed Solution
The recommended approach is to add a pure helper named `autoDailyRadarPreferencePersistence()` that takes `{ loaded, enabled }` and returns `{ shouldWrite, value }`. Before preferences are loaded, it returns `shouldWrite: false`, preventing the initial false state from becoming a saved opt-out. After hydration, it returns `shouldWrite: true` with `"true"` or `"false"` matching the current user preference.

Alternative approaches considered:

Initializing the React state to `true` is simpler but can allow the auto-run effect to reason from a default before storage is hydrated, which is more fragile in a client component with multiple effects.

Using only a local `useRef` guard in the component is smaller but leaves the behavior untested and harder to reason about. Extracting the persistence gate as a pure helper matches the existing pattern in this feature area.

# Implementation Plan

### Task 1: Add RED Test For Preference Persistence Gate

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `autoDailyRadarPreferencePersistence` to the import list and add a test near `autoDailyRadarEnabledFromStorage`:

```js
test("autoDailyRadarPreferencePersistence skips writes until preference is loaded", () => {
  assert.deepEqual(
    autoDailyRadarPreferencePersistence({ loaded: false, enabled: false }),
    { shouldWrite: false, value: "" },
  );
  assert.deepEqual(
    autoDailyRadarPreferencePersistence({ loaded: true, enabled: true }),
    { shouldWrite: true, value: "true" },
  );
  assert.deepEqual(
    autoDailyRadarPreferencePersistence({ loaded: true, enabled: false }),
    { shouldWrite: true, value: "false" },
  );
});
```

**Step 2: Run the focused test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `autoDailyRadarPreferencePersistence` is not exported.

### Task 2: Implement Pure Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add the minimal helper**

Add near `autoDailyRadarEnabledFromStorage()`:

```js
export function autoDailyRadarPreferencePersistence({ loaded, enabled } = {}) {
  if (!loaded) return { shouldWrite: false, value: "" };
  return { shouldWrite: true, value: enabled ? "true" : "false" };
}
```

**Step 2: Run the focused test to verify it passes**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Wire Helper Into AI Money Page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Add `autoDailyRadarPreferencePersistence` to the existing AI goal preset imports, then create a local typed wrapper:

```ts
const decideAutoRadarPreferencePersistence =
  autoDailyRadarPreferencePersistence as unknown as (input: {
    loaded: boolean;
    enabled: boolean;
  }) => { shouldWrite: boolean; value: string };
```

**Step 2: Track preference hydration**

Add state:

```ts
const [autoRadarPreferenceLoaded, setAutoRadarPreferenceLoaded] = useState(false);
```

In the localStorage read effect, after setting `autoRadarEnabled(enabled)`, also set `autoRadarPreferenceLoaded(true)`.

**Step 3: Gate the localStorage write effect**

Replace the unconditional write effect with a helper-based decision:

```ts
const persistence = decideAutoRadarPreferencePersistence({
  loaded: autoRadarPreferenceLoaded,
  enabled: autoRadarEnabled,
});
if (!persistence.shouldWrite) return;
window.localStorage.setItem(AUTO_DAILY_RADAR_ENABLED_KEY, persistence.value);
```

**Step 4: Prevent auto-scan before preference hydration**

In the auto-run decision effect, return early if `!autoRadarPreferenceLoaded`. Add it to the dependency array. This keeps the initial conservative `false` render from triggering any scan path before the saved/default preference is known.

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
```

Expected: PASS.

Run:

```bash
cd client && yarn typecheck
```

Expected: PASS.

Run:

```bash
cd client && yarn lint
```

Expected: exit 0. Known existing warning in `client/data/use-activity-center.tsx:138` may remain.

Run:

```bash
git diff --check
```

Expected: PASS.

Implementation Checklist:
1. Add the failing persistence-gate test in `client/data/ai-goal-preset.test.mjs`.
2. Run the focused node test and confirm the new test fails for the missing export.
3. Implement `autoDailyRadarPreferencePersistence()` in `client/data/ai-goal-preset.mjs`.
4. Run the focused node test and confirm it passes.
5. Import and type the helper in `client/app/(dashboard)/ai-money/client.tsx`.
6. Add `autoRadarPreferenceLoaded` state and set it when preference hydration completes.
7. Gate the localStorage write effect with the helper decision.
8. Gate the auto daily radar scan effect until preference hydration completes.
9. Run node tests, typecheck, lint, and `git diff --check`.
10. Update Task Progress and Final Review in this plan document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 11:31:13 +0800
    *   Step: 1. Add the failing persistence-gate test in `client/data/ai-goal-preset.test.mjs`; 2. Run the focused node test and confirm the new test fails for the missing export.
    *   Modifications: Added the import and behavior test for `autoDailyRadarPreferencePersistence`.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './ai-goal-preset.mjs' does not provide an export named 'autoDailyRadarPreferencePersistence'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:31:13 +0800
    *   Step: 3. Implement `autoDailyRadarPreferencePersistence()` in `client/data/ai-goal-preset.mjs`; 4. Run the focused node test and confirm it passes.
    *   Modifications: Added `autoDailyRadarPreferencePersistence()` and verified `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: GREEN confirmed with 205 passing tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:31:13 +0800
    *   Step: 5. Import and type the helper in `client/app/(dashboard)/ai-money/client.tsx`; 6. Add `autoRadarPreferenceLoaded` state and set it when preference hydration completes; 7. Gate the localStorage write effect with the helper decision; 8. Gate the auto daily radar scan effect until preference hydration completes.
    *   Modifications: Imported `autoDailyRadarPreferencePersistence`, added a typed wrapper, added `autoRadarPreferenceLoaded`, synchronized loaded/enabled state in the hydration timer, gated preference writes, and gated auto-scan until hydration completes. Minor correction: set `autoRadarEnabled` and `autoRadarPreferenceLoaded` in the same timer callback so loaded cannot become true while the old false state is still active.
    *   Change Summary: The page no longer writes the initial conservative false state to localStorage before reading the saved/default preference.
    *   Reason: Executing plan steps 5-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:34:27 +0800
    *   Step: 9. Run node tests, typecheck, lint, and `git diff --check`; 10. Update Task Progress and Final Review in this plan document.
    *   Modifications: Ran the planned verification commands and updated this document.
    *   Change Summary: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` passed with 207 tests; `yarn typecheck` passed; `yarn lint` exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`; `git diff --check` passed.
    *   Reason: Executing plan steps 9-10.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan, including the reported minor correction that synchronizes `autoRadarEnabled` and `autoRadarPreferenceLoaded` in the same timer callback. No unreported deviations were found.

Security and safety review: the change only affects client-side localStorage persistence and auto-scan gating. It does not broaden execution modes, does not enable live trading, and does not change any order or credential path.

Maintainability review: the persistence decision is a pure helper with a dedicated test, and the React component uses that helper instead of embedding the persistence rule directly in the effect.
