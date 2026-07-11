# AI Money Path Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money path panel stop presenting AI scan as the current path step when the real AI provider is blocked or still loading.

**Architecture:** `client/data/ai-goal-preset.mjs` remains the source of derived AI Money panel state. `aiMoneyPathFromState` will accept an optional `providerGate`; with no active analysis and a blocked/loading gate, it returns a provider setup path where the provider step is current or blocked and the scan step is pending. The AI Money page passes the already computed provider gate into the path builder.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware money path behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing `aiMoneyPathFromState starts with a single safe scan step` case:

- With no analysis and a blocked `providerGate`, the path stage is `provider_blocked`, the primary action is `open_link`, the primary href is `/settings/ai`, the current step is `provider`, and the scan step has no `scan_today` action.
- With no analysis and a loading `providerGate`, the path stage is `provider_loading`, the primary action is `open_link`, the primary href is `/settings/ai`, and the title mentions provider confirmation.
- With no analysis and a ready `providerGate`, the existing `scan` current-step behavior remains.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the blocked/loading tests fail because `aiMoneyPathFromState` does not yet read `providerGate`.

### Task 2: Implement provider-aware money path state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiMoneyPathFromState`.

**Step 2: Pass provider gate to setup checklist**

Pass `providerGate` into the internal `aiSetupChecklistFromState` call so summaries remain aligned when the path falls through to existing analysis behavior.

**Step 3: Return setup path before idle scan path**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return:

- `stage`: `provider_blocked` or `provider_loading`
- `title`: `先配置真实 AI` for blocked or `正在确认 AI provider` for loading
- `tone: "warning"`
- `summary` from the gate or a safe fallback
- `currentStepId: "provider"`
- `primaryAction: { kind: "open_link", label }`
- `primaryHref` from the gate or `/settings/ai`
- Steps beginning with a `provider` step, followed by the existing scan/context/blueprint/validation/sentiment/paper/testnet path as pending or blocked states. The scan step must not expose `scan_today` while provider is blocked/loading.
- `nextActions` explaining that the user should configure or wait for the real AI provider before AI scanning.

**Step 4: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current path generation unchanged.

### Task 3: Pass provider gate from AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder type**

Add `providerGate?: AIProviderReadinessGateState | null` to the `buildMoneyPath` input type.

**Step 2: Pass computed gate**

Pass `providerGate` into `buildMoneyPath`.

No panel rendering change is required because `AIMoneyPathPanel` already handles `open_link` actions and step hrefs.

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
1. Add failing money-path tests for blocked, loading, and ready provider gates.
2. Run the focused Node test and confirm blocked/loading tests fail for the expected reason.
3. Update `aiMoneyPathFromState` to accept `providerGate`, pass it to setup checklist, and return provider setup path for blocked/loading idle states.
4. Update the AI Money page money-path builder type and call to pass `providerGate`.
5. Re-run the focused Node test and confirm it passes.
6. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
7. Review the implementation against this plan and report any deviations.

## Task Progress

* 2026-06-03 14:14:44 CST
  * Step: 1-2. Add provider-gate money-path tests and verify RED.
  * Modifications: Added blocked, loading, and ready provider-gate coverage to `client/data/ai-goal-preset.test.mjs`; ran `node --test client/data/ai-goal-preset.test.mjs` and observed the blocked/loading cases fail because `aiMoneyPathFromState` still returned `idle`.
  * Change Summary: The test suite now captures that Money Path must not expose scan as current while the real AI provider is blocked or loading.
  * Reason: Executing plan steps 1 and 2.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:14:44 CST
  * Step: 3. Update `aiMoneyPathFromState`.
  * Modifications: Added optional `providerGate` input, passed it to `aiSetupChecklistFromState`, and returned a provider-first path for blocked/loading idle states with scan downgraded to pending and no `scan_today` action.
  * Change Summary: Money Path now aligns with Now Action, Daily Mission, and Setup Checklist when real AI is unavailable.
  * Reason: Executing plan step 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:14:44 CST
  * Step: 4. Pass `providerGate` from AI Money page.
  * Modifications: Extended the `buildMoneyPath` input type in `client/app/(dashboard)/ai-money/client.tsx` and passed the computed `providerGate` value into `buildMoneyPath`.
  * Change Summary: The page now supplies provider readiness state to the Money Path helper.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:14:44 CST
  * Step: 5-7. Verify and review.
  * Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`; reviewed modified snippets against the plan.
  * Change Summary: Verification passed. Lint retains the known pre-existing warning at `client/data/use-activity-center.tsx:138`.
  * Reason: Executing plan steps 5, 6, and 7.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. The new tests prove blocked, loading, and ready provider states; `aiMoneyPathFromState` returns a provider-first path before idle scan generation only for blocked/loading gates with no active analysis; the AI Money page passes the computed `providerGate`; verification commands passed with only the known existing lint warning.
