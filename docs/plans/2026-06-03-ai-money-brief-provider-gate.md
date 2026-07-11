# AI Money Brief Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the top AI Money brief point users to real AI setup when the active provider is blocked or still loading before any analysis exists.

**Architecture:** `client/data/ai-goal-preset.mjs` remains the source of derived AI Money state. `aiMoneyBriefFromState` will accept an optional `providerGate`; with no active analysis and a blocked/loading gate, it returns an `open_link` primary action to `/settings/ai` instead of a scan action. The AI Money page passes the already computed provider gate into the brief builder. Ready, unknown, missing gate, and existing-analysis behavior remain unchanged.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware money brief behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing `aiMoneyBriefFromState starts idle users with today's scan action` case:

- With no analysis and a blocked `providerGate`, brief stage is `provider_blocked`, tone is `warning`, primary action is `open_link`, primary href is `/settings/ai`, confidence is `0`, and checkpoints mention provider setup rather than scanning.
- With no analysis and a loading `providerGate`, brief stage is `provider_loading`, primary action is `open_link`, primary href is `/settings/ai`, and the title mentions provider confirmation.
- With no analysis and a ready `providerGate`, the existing scan behavior remains.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the blocked/loading tests fail because `aiMoneyBriefFromState` does not yet read `providerGate`.

### Task 2: Implement provider-aware money brief state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiMoneyBriefFromState`.

**Step 2: Return setup brief before idle scan brief**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return:

- `stage`: `provider_blocked` or `provider_loading`
- `title`: `先配置真实 AI` for blocked or `正在确认 AI provider` for loading
- `tone: "warning"`
- `confidence: 0`
- `audit` with warning verdict and provider-related blocker/warning
- `summary` from the gate or a safe fallback
- `primaryHref` from the gate or `/settings/ai`
- `primaryAction: { kind: "open_link", label }`
- `metrics` describing AI readiness, recent runs, and execution state
- `checkpoints` explaining provider setup/confirmation before AI scan, strategy generation, or trading

**Step 3: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current brief generation unchanged.

### Task 3: Pass provider gate from AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder type**

Add `providerGate?: AIProviderReadinessGateState | null` to the `buildMoneyBrief` input type.

**Step 2: Pass computed gate**

Pass `providerGate` into `buildMoneyBrief`.

No panel rendering change is required because `AIMoneyBriefPanel` already handles `open_link` and `primaryHref`.

### Task 4: Verify and review

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
yarn typecheck
yarn lint
git diff --check
```

Expected:

- Node tests pass.
- TypeScript passes.
- Lint passes, allowing the existing warning in `client/data/use-activity-center.tsx`.
- Diff check reports no whitespace errors.

Implementation Checklist:
1. Add failing money-brief tests for blocked, loading, and ready provider gates.
2. Run the focused Node test and confirm blocked/loading tests fail for the expected reason.
3. Update `aiMoneyBriefFromState` to accept `providerGate` and return setup/open-link brief state for blocked/loading idle states.
4. Update the AI Money page money-brief builder type and call to pass `providerGate`.
5. Re-run the focused Node test and confirm it passes.
6. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
7. Review the implementation against this plan and report any deviations.

## Task Progress

* 2026-06-03 14:22:03 CST
  * Step: 1-2. Add provider-gate money-brief tests and verify RED.
  * Modifications: Added blocked, loading, and ready provider-gate coverage to `client/data/ai-goal-preset.test.mjs`; ran `node --test client/data/ai-goal-preset.test.mjs` and observed the blocked/loading cases fail because `aiMoneyBriefFromState` still returned `idle`.
  * Change Summary: The test suite now captures that the top Money Brief must point to AI settings before offering scan when the real provider is blocked/loading.
  * Reason: Executing plan steps 1 and 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:22:03 CST
  * Step: 3. Update `aiMoneyBriefFromState`.
  * Modifications: Added optional `providerGate` input and a no-analysis blocked/loading branch that returns warning brief state with `open_link` primary action, provider audit, setup metrics, and provider-first checkpoints.
  * Change Summary: The top Money Brief now aligns with Now Action, Daily Mission, Money Path, and Setup Checklist when real AI is unavailable.
  * Reason: Executing plan step 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:22:03 CST
  * Step: 4. Pass `providerGate` from AI Money page.
  * Modifications: Extended the `buildMoneyBrief` input type in `client/app/(dashboard)/ai-money/client.tsx` and passed the computed `providerGate` value into `buildMoneyBrief`.
  * Change Summary: The page now supplies provider readiness state to the top brief helper.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:22:03 CST
  * Step: 5-7. Verify and review.
  * Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`; reviewed modified snippets against the plan.
  * Change Summary: Verification passed. Lint retains the known pre-existing warning at `client/data/use-activity-center.tsx:138`.
  * Reason: Executing plan steps 5, 6, and 7.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. The new tests prove blocked, loading, and ready provider states; `aiMoneyBriefFromState` returns provider setup/open-link brief state before idle scan generation only for blocked/loading gates with no active analysis; the AI Money page passes the computed `providerGate`; verification commands passed with only the known existing lint warning.
