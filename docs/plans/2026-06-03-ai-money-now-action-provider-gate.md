# AI Money Now Action Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the primary "AI 当前任务" CTA point to AI provider setup when real AI is blocked or still loading before any analysis exists.

**Architecture:** `client/data/ai-goal-preset.mjs` remains the source of derived UI state. `aiNowActionFromState` will accept an optional `providerGate`; when there is no active analysis and the gate is `blocked` or `loading`, it returns an `open_link` action instead of a scan action. The AI Money page will pass the already computed provider gate into the now-action builder. Existing scan behavior remains unchanged for ready, unknown, or absent gates.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware now action behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing `aiNowActionFromState starts idle users...` case:

- With no analysis and a blocked `providerGate`, now action returns `primaryAction.kind === "open_link"`, `primaryHref === "/settings/ai"`, and summary/guardrail explain that real AI must be configured first.
- With no analysis and a loading `providerGate`, now action also returns `open_link` to `/settings/ai`, but the title reflects provider confirmation in progress.
- With no analysis and a ready `providerGate`, existing scan behavior remains.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the blocked/loading tests fail because `aiNowActionFromState` does not yet read `providerGate`.

### Task 2: Implement provider-aware now action state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiNowActionFromState`.

**Step 2: Return setup action before idle scans**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return a state with:

- `stage`: `provider_blocked` or `provider_loading`
- `tone: "warning"`
- `owner: "你"`
- `primaryHref` from the gate or `/settings/ai`
- `primaryAction.kind: "open_link"`
- `primaryAction.label` from the gate or a safe fallback
- guardrail explaining that no fallback scan or trading action is launched before real AI is confirmed

**Step 3: Preserve existing scan behavior**

For ready, unknown, missing gate, or existing analysis, keep the existing now-action logic.

### Task 3: Pass provider gate from AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder type**

Add `providerGate?: AIProviderReadinessGateState | null` to the `buildNowAction` input type.

**Step 2: Pass computed gate**

Pass `providerGate` into `buildNowAction`.

No button rendering change is required because `AINowActionPanel` already handles `open_link`.

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
1. Add failing now-action tests for blocked, loading, and ready provider gates.
2. Run the focused Node test and confirm blocked/loading tests fail for the expected reason.
3. Update `aiNowActionFromState` to accept `providerGate` and return setup actions for blocked/loading idle states.
4. Update the AI Money page now-action builder type and call to pass `providerGate`.
5. Re-run the focused Node test and confirm it passes.
6. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
7. Review the implementation against this plan and report any deviations.
