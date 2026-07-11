# AI Rhythm Runbook Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Operator Rhythm and Delegation Runbook panels point to real AI setup when the active provider is blocked or still loading before any analysis exists.

**Architecture:** `client/data/ai-goal-preset.mjs` remains the source of derived AI Money state. `aiOperatorRhythmFromState` and `aiDelegationRunbookFromState` will accept an optional `providerGate`; with no active analysis and a blocked/loading gate, they return `open_link` primary actions to `/settings/ai` instead of scan actions. The AI Money page passes the already computed provider gate into both builders. Ready, unknown, missing gate, and existing-analysis behavior remain unchanged.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware rhythm and runbook behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing idle tests:

- With no analysis and a blocked `providerGate`, `aiOperatorRhythmFromState` returns `stage: "provider_blocked"`, primary action `open_link`, href `/settings/ai`, cadence instructing setup, and checks/guardrails mention provider before scanning.
- With no analysis and a loading `providerGate`, `aiOperatorRhythmFromState` returns `stage: "provider_loading"`, primary action `open_link`, href `/settings/ai`, and title mentions provider confirmation.
- With no analysis and a ready `providerGate`, existing rhythm scan behavior remains.
- With no analysis and a blocked `providerGate`, `aiDelegationRunbookFromState` returns `stage: "provider_blocked"`, primary action `open_link`, href `/settings/ai`, no ready AI scan step, and human steps include provider setup.
- With no analysis and a loading `providerGate`, `aiDelegationRunbookFromState` returns `stage: "provider_loading"`, primary action `open_link`, href `/settings/ai`, and title mentions provider confirmation.
- With no analysis and a ready `providerGate`, existing runbook handoff behavior remains.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: blocked/loading tests fail because the helpers do not yet read `providerGate`.

### Task 2: Implement provider-aware operator rhythm

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiOperatorRhythmFromState`.

**Step 2: Return setup rhythm before idle scan rhythm**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return:

- `stage`: `provider_blocked` or `provider_loading`
- `title`: `先配置真实 AI` for blocked or `正在确认 AI provider` for loading
- `tone: "warning"`
- `cadence`: setup/waiting cadence
- `summary` from the gate or a safe fallback
- `primaryAction: { kind: "open_link", label, href }`
- metrics showing active judgment, history, and paused rhythm
- provider-specific guardrails/checks before scanning, validation, or trading

**Step 3: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current rhythm generation unchanged.

### Task 3: Implement provider-aware delegation runbook

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiDelegationRunbookFromState`.

**Step 2: Return setup runbook before idle handoff**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return:

- `stage`: `provider_blocked` or `provider_loading`
- `title`: `先配置真实 AI` for blocked or `正在确认 AI provider` for loading
- `tone: "warning"`
- `decision` from the gate or a safe fallback
- `primaryAction: { kind: "open_link", label, href }`
- metrics showing zero AI delegation until provider is ready
- `aiSteps` waiting on provider instead of ready scan/generate steps
- `humanSteps` with provider configuration/current confirmation as current
- guardrails that provider setup happens before scan/validation/trading

**Step 3: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current runbook generation unchanged.

### Task 4: Pass provider gate from AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder types**

Add `providerGate?: AIProviderReadinessGateState | null` to `buildDelegationRunbook` and `buildOperatorRhythm` input types.

**Step 2: Pass computed gate**

Pass `providerGate` into both builders.

No panel rendering change is required because both panels already handle `open_link`.

### Task 5: Verify and review

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
1. Add failing operator-rhythm tests for blocked, loading, and ready provider gates.
2. Add failing delegation-runbook tests for blocked, loading, and ready provider gates.
3. Run the focused Node test and confirm blocked/loading tests fail for the expected reason.
4. Update `aiOperatorRhythmFromState` to accept `providerGate` and return setup/open-link rhythm state for blocked/loading idle states.
5. Update `aiDelegationRunbookFromState` to accept `providerGate` and return setup/open-link runbook state for blocked/loading idle states.
6. Update the AI Money page builder types and calls to pass `providerGate`.
7. Re-run the focused Node test and confirm it passes.
8. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
9. Review the implementation against this plan and report any deviations.

## Task Progress

* 2026-06-03 14:43:15 CST
  * Step: 1-3. Add RED coverage for Operator Rhythm and Delegation Runbook provider gates.
  * Modifications: Added blocked/loading/ready provider gate tests in `client/data/ai-goal-preset.test.mjs`.
  * Change Summary: The focused Node test failed with the expected stages still returning `scan_due` and `handoff` instead of provider setup states.
  * Reason: Executing plan steps 1-3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation
* 2026-06-03 14:43:15 CST
  * Step: 4-6. Implement provider-aware helper branches and pass the page-level gate.
  * Modifications: Added `providerGate` support to `aiOperatorRhythmFromState` and `aiDelegationRunbookFromState`; added provider setup/loading return states with `open_link` actions; passed `providerGate` through the AI Money page builder types and calls.
  * Change Summary: Idle Operator Rhythm and Delegation Runbook now send blocked/loading provider states to `/settings/ai` before allowing scan/handoff actions.
  * Reason: Executing plan steps 4-6.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation
* 2026-06-03 14:43:15 CST
  * Step: 7-9. Verify and review.
  * Modifications: Ran focused Node tests, `yarn typecheck`, `yarn lint`, and `git diff --check`; reviewed helper and page call sites against the plan.
  * Change Summary: All focused tests passed; TypeScript passed; lint passed with the existing `client/data/use-activity-center.tsx` unused eslint-disable warning; diff check reported no whitespace errors.
  * Reason: Executing plan steps 7-9.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation

## Final Review

Implementation perfectly matches the final plan.

No unreported deviations were found. The new behavior is limited to idle states with a blocked/loading provider gate; ready, unknown, missing gate, and existing-analysis behavior remain unchanged. Security posture is unchanged because the new actions only open the internal AI settings page and do not trigger scans, validation, paper, or trading while the provider is unavailable.
