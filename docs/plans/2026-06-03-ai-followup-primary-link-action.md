# AI Followup Primary Link Action Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Follow-up Queue header render direct link actions such as "open saved strategy" when AI chooses an `open_link` primary action.

**Architecture:** Add a pure helper that normalizes the follow-up queue primary action for UI use, including `open_link` actions with hrefs. The AI Money page will use that helper before rendering the primary queue button.

**Tech Stack:** Next.js client component, React, TypeScript, Node test runner for `.mjs` helper tests.

# Context
Filename: 2026-06-03-ai-followup-primary-link-action.md
Created On: 2026-06-03 11:49:07 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
`aiRunFollowupQueueFromRuns()` can return `primaryAction.kind === "open_link"` for important AI follow-ups such as saved strategies that still need backtesting. `AIRunFollowupQueuePanel` currently renders header buttons for `open_run`, `refresh_run`, `validate_run`, and `scan_today`, but not `open_link`. That hides the highest-priority direct action from the panel header.

# Project Overview
`finance_next` is a monorepo with a Next.js client and Go gateway. This task only touches AI Money frontend behavior and the pure AI goal helper/test file.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
Relevant files:

`client/data/ai-goal-preset.mjs` builds the AI follow-up queue and already emits `open_link` for saved strategy and evidence links.

`client/app/(dashboard)/ai-money/client.tsx` renders `AIRunFollowupQueuePanel`. The list items include an external href link, but the primary header button ignores `open_link`, which adds unnecessary hunting for the user.

`client/data/ai-goal-preset.test.mjs` has adjacent queue tests and should receive the new helper test first.

# Proposed Solution
Add `aiRunFollowupPrimaryActionForQueue(queue)`. It returns `null` without a usable primary action, returns `{ kind: "open_link", label, href }` for link actions, and passes through existing actionable queue primary actions. Then `AIRunFollowupQueuePanel` uses this normalized action to render a top-level `Link` when `kind === "open_link"`.

Alternative approaches considered:

Adding the `open_link` branch directly inside the component is smaller but leaves the action normalization untested. Duplicating per-action handling from the list item would also make future follow-up actions harder to reason about.

# Implementation Plan

### Task 1: Add RED Tests For Primary Action Normalization

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing tests**

Import `aiRunFollowupPrimaryActionForQueue` and add tests near the follow-up queue tests:

```js
test("aiRunFollowupPrimaryActionForQueue exposes open_link as a header action", () => {
  const queue = aiRunFollowupQueueFromRuns([...saved strategy run fixture...]);
  const action = aiRunFollowupPrimaryActionForQueue(queue);

  assert.deepEqual(action, {
    kind: "open_link",
    label: "打开已保存策略",
    href: "/strategies/opt123?from=ai-draft&aiRunId=goal_saved",
    runId: "goal_saved",
  });
});

test("aiRunFollowupPrimaryActionForQueue keeps scan and run actions usable", () => {
  assert.deepEqual(
    aiRunFollowupPrimaryActionForQueue({
      primaryAction: { kind: "scan_today", label: "启动今日扫描" },
    }),
    { kind: "scan_today", label: "启动今日扫描" },
  );
});
```

**Step 2: Run focused test to verify it fails**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: FAIL because `aiRunFollowupPrimaryActionForQueue` is not exported.

### Task 2: Implement Pure Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper after `aiRunFollowupQueueFromRuns()`**

Implement:

```js
export function aiRunFollowupPrimaryActionForQueue(queue = {}) {
  const action = queue?.primaryAction;
  const kind = String(action?.kind || "");
  const label = String(action?.label || "").trim();
  if (!kind || !label) return null;
  if (kind === "open_link") {
    const href = String(action?.href || "").trim();
    if (!href) return null;
    return { kind, label, href, ...(action.runId ? { runId: action.runId } : {}) };
  }
  return {
    kind,
    label,
    ...(action.runId ? { runId: action.runId } : {}),
    ...(action.href ? { href: action.href } : {}),
  };
}
```

**Step 2: Run focused test to verify it passes**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: PASS.

### Task 3: Wire Into Follow-up Queue Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type helper**

Add `aiRunFollowupPrimaryActionForQueue` to imports and define a typed wrapper near the other helper casts.

**Step 2: Render open_link in `AIRunFollowupQueuePanel`**

Inside `AIRunFollowupQueuePanel`, compute:

```ts
const primary = buildRunFollowupPrimaryAction(queue);
```

Use `primary` instead of `queue.primaryAction` for the header control, and add a first branch:

```tsx
primary?.kind === "open_link" && primary.href ? (
  <Link href={primary.href} ...>{primary.label}</Link>
) : ...
```

### Task 4: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add failing tests for `aiRunFollowupPrimaryActionForQueue`.
2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm missing export failure.
3. Implement `aiRunFollowupPrimaryActionForQueue()` in `client/data/ai-goal-preset.mjs`.
4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm it passes.
5. Import and type the helper in `client/app/(dashboard)/ai-money/client.tsx`.
6. Render `open_link` as the follow-up queue header primary action.
7. Run node tests, typecheck, lint, and `git diff --check`.
8. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 11:49:07 +0800
    *   Step: 1. Add failing tests for `aiRunFollowupPrimaryActionForQueue`; 2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm missing export failure.
    *   Modifications: Added import and tests for `open_link`, `scan_today`, and `validate_run` follow-up primary actions.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './ai-goal-preset.mjs' does not provide an export named 'aiRunFollowupPrimaryActionForQueue'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:49:07 +0800
    *   Step: 3. Implement `aiRunFollowupPrimaryActionForQueue()` in `client/data/ai-goal-preset.mjs`; 4. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm it passes.
    *   Modifications: Added `aiRunFollowupPrimaryActionForQueue()` after the initial-run helper.
    *   Change Summary: GREEN confirmed with 211 passing `ai-goal-preset` tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:49:07 +0800
    *   Step: 5. Import and type the helper in `client/app/(dashboard)/ai-money/client.tsx`; 6. Render `open_link` as the follow-up queue header primary action.
    *   Modifications: Added `buildRunFollowupPrimaryAction`, derived `primaryRun` from the normalized action, and rendered `open_link` as a header `Link`. Minor correction: `primaryRun` now reads from the normalized primary action rather than raw `queue.primaryAction`.
    *   Change Summary: Follow-up queue header now exposes direct links for highest-priority link actions such as saved strategies.
    *   Reason: Executing plan steps 5-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 11:53:19 +0800
    *   Step: 7. Run node tests, typecheck, lint, and `git diff --check`; 8. Update Task Progress and Final Review in this document.
    *   Modifications: Recorded verification results and completed the final review section.
    *   Change Summary: Verified the helper tests, AI settings workflow tests, TypeScript check, lint, and patch whitespace check. Lint exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`.
    *   Reason: Executing plan steps 7-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

Checklist verification:

1. Failing tests were added for `aiRunFollowupPrimaryActionForQueue`.
2. RED was confirmed by the missing export failure.
3. `aiRunFollowupPrimaryActionForQueue()` was implemented in `client/data/ai-goal-preset.mjs`.
4. Focused `ai-goal-preset` tests passed after implementation.
5. The helper was imported and typed in `client/app/(dashboard)/ai-money/client.tsx`.
6. `open_link` now renders as the follow-up queue header primary action.
7. Verification completed: node tests reported 213 passing tests, `yarn typecheck` passed, `yarn lint` exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and `git diff --check` passed.
8. Task Progress and Final Review were updated.

No unreported deviations were detected. The reported minor correction was deriving `primaryRun` from the normalized primary action instead of raw `queue.primaryAction`, which keeps the component aligned with the new helper.
