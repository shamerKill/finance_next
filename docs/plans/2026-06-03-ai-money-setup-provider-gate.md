# AI Money Setup Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Money setup checklist use the live provider readiness gate, so users can see whether real AI is configured before running an analysis.

**Architecture:** `client/data/ai-goal-preset.mjs` remains the source of derived UI state. `aiSetupChecklistFromState` will accept an optional `providerGate` object and prefer it over stale or missing `analysis.ai` provider status. The AI Money page will pass the already computed `providerGate` into the checklist builder.

**Tech Stack:** Next.js client component, plain JS state helpers, Node test runner.

### Task 1: Cover provider gate behavior in setup checklist

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing `aiSetupChecklistFromState` cases:

- A blocked `providerGate` with no analysis marks the `provider` item as `blocked`, links to `/settings/ai`, and makes the checklist primary action configure AI.
- A ready `providerGate` with no analysis marks the `provider` item as `ready` and keeps the primary action as the daily radar action.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the new tests fail because `aiSetupChecklistFromState` does not yet read `providerGate`.

### Task 2: Implement provider gate support in the data helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiSetupChecklistFromState`.

**Step 2: Derive provider status from gate first**

When `providerGate.stage` is:

- `ready`: set provider status to `ready` and detail from gate summary or "真实 AI provider 已可用。"
- `blocked`: set provider status to `blocked`, detail from gate summary, and href from gate primary href.
- `loading`: set provider status to `warning`, detail from gate summary.
- any other value: fall back to the existing `analysis.ai` behavior.

**Step 3: Preserve existing fallback behavior**

If no useful `providerGate` is supplied, retain the current `analysis.ai` logic and checklist primary action priority.

### Task 3: Pass provider gate from the AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder type**

Add `providerGate?: AIProviderReadinessGateState | null` to the `buildSetupChecklist` input type.

**Step 2: Pass computed gate**

Pass `providerGate` into the `buildSetupChecklist` call.

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
1. Add failing setup checklist tests for blocked and ready provider gates.
2. Run the focused Node test and confirm the new tests fail for the expected reason.
3. Update `aiSetupChecklistFromState` to accept and prefer `providerGate` for provider item state.
4. Update the AI Money page checklist builder type and call to pass `providerGate`.
5. Re-run the focused Node test and confirm it passes.
6. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
7. Review the implementation against this plan and report any deviations.
