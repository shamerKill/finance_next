# AI Autonomous Command Provider Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the AI Command Center and "让 AI 接管下一步" panel point to real AI setup when the active provider is blocked or still loading before any analysis exists.

**Architecture:** `client/data/ai-goal-preset.mjs` remains the source of derived AI Money state. `aiCommandCenterFromState` will accept an optional `providerGate`; with no active analysis and a blocked/loading gate, it returns an `open_link` command to `/settings/ai` instead of an AI scan command. `aiAutonomousCommandFromState` will accept and pass the same gate into both `aiCommandCenterFromState` and `aiNowActionFromState`, then preserve provider-specific stages so the "AI 接管" panel does not mislabel the setup action as a normal follow-up.

**Tech Stack:** Next.js client component, plain JS state helper, Node test runner.

### Task 1: Cover provider-aware command behavior

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests near the existing command center and autonomous command idle tests:

- With no analysis and a blocked `providerGate`, `aiCommandCenterFromState` returns `stage: "provider_blocked"`, `primaryAction.kind: "open_link"`, `primaryHref: "/settings/ai"`, provider evidence is blocked, and no `analyze_and_validate` scan command is exposed.
- With no analysis and a loading `providerGate`, `aiCommandCenterFromState` returns `stage: "provider_loading"`, `primaryAction.kind: "open_link"`, `primaryHref: "/settings/ai"`, and title mentions provider confirmation.
- With no analysis and a ready `providerGate`, existing command-center scan behavior remains.
- With no analysis and a blocked `providerGate`, `aiAutonomousCommandFromState` returns `stage: "provider_blocked"`, `owner: "你"`, `primaryAction.kind: "open_link"`, `primaryHref: "/settings/ai"`, and does not expose `proposedFormState`/`scanFormState`.
- With no analysis and a loading `providerGate`, `aiAutonomousCommandFromState` returns `stage: "provider_loading"` and the same open-link setup action.
- With no analysis and a ready `providerGate`, existing autonomous scan behavior remains.

**Step 2: Verify red**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: blocked/loading tests fail because the helpers do not yet read or pass `providerGate`.

### Task 2: Implement provider-aware command center state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiCommandCenterFromState`.

**Step 2: Return setup command before idle scan command**

When `analysis` is null and `providerGate.stage` is `blocked` or `loading`, return:

- `stage`: `provider_blocked` or `provider_loading`
- `title`: `先配置真实 AI` for blocked or `正在确认 AI provider` for loading
- `tone: "warning"`
- `summary` from the gate or a safe fallback
- `primaryHref` from the gate or `/settings/ai`
- `primaryAction: { kind: "open_link", label }`
- metrics showing AI status, recent runs, handoff, and execution state
- evidence beginning with a provider item, then pending market/context/blueprint/validation items and blocked safety gates
- next actions that instruct the user to configure or wait for real AI before scanning

**Step 3: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current command-center generation unchanged.

### Task 3: Implement provider-aware autonomous command state

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Extend input**

Add `providerGate = null` to `aiAutonomousCommandFromState`.

**Step 2: Pass provider gate downstream**

Pass `providerGate` into `aiCommandCenterFromState` and `aiNowActionFromState`.

**Step 3: Preserve provider stage**

When `analysis` is null and command center stage is `provider_blocked` or `provider_loading`, use that provider stage for the autonomous command instead of mapping the open link to generic `followup`.

**Step 4: Preserve existing behavior**

For ready, unknown, missing gate, or existing analysis, keep current autonomous command generation unchanged.

### Task 4: Pass provider gate from AI Money page

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Extend builder types**

Add `providerGate?: AIProviderReadinessGateState | null` to the `buildCommandCenter` and `buildAutonomousCommand` input types.

**Step 2: Pass computed gate**

Pass `providerGate` into both builders.

No panel rendering change is required because both panels already handle `open_link` and `primaryHref`.

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
1. Add failing command-center tests for blocked, loading, and ready provider gates.
2. Add failing autonomous-command tests for blocked, loading, and ready provider gates.
3. Run the focused Node test and confirm blocked/loading tests fail for the expected reason.
4. Update `aiCommandCenterFromState` to accept `providerGate` and return provider setup/open-link command state for blocked/loading idle states.
5. Update `aiAutonomousCommandFromState` to accept/pass `providerGate` and preserve provider-specific stages.
6. Update the AI Money page command builder types and calls to pass `providerGate`.
7. Re-run the focused Node test and confirm it passes.
8. Run `yarn typecheck`, `yarn lint`, and `git diff --check`.
9. Review the implementation against this plan and report any deviations.

## Task Progress

* 2026-06-03 14:31:31 CST
  * Step: 1-3. Add provider-gate command tests and verify RED.
  * Modifications: Added blocked, loading, and ready provider-gate coverage for `aiCommandCenterFromState` and `aiAutonomousCommandFromState` in `client/data/ai-goal-preset.test.mjs`; ran `node --test client/data/ai-goal-preset.test.mjs` and observed blocked/loading cases fail because Command Center still returned `scan` and Autonomous Command still returned `start`.
  * Change Summary: The test suite now captures that AI command entrypoints must not offer scan/AI takeover while the real provider is blocked/loading.
  * Reason: Executing plan steps 1, 2, and 3.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:31:31 CST
  * Step: 4. Update `aiCommandCenterFromState`.
  * Modifications: Added optional `providerGate` input and a no-analysis blocked/loading branch that returns a provider setup command with `open_link`, provider evidence, paused execution metrics, and provider-first next actions.
  * Change Summary: Command Center now points to AI settings before exposing scan or validation commands when real AI is unavailable.
  * Reason: Executing plan step 4.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:31:31 CST
  * Step: 5. Update `aiAutonomousCommandFromState`.
  * Modifications: Added optional `providerGate` input, passed it to Command Center and Now Action, and preserved `provider_blocked` / `provider_loading` stages instead of mapping setup links to generic follow-up.
  * Change Summary: The "让 AI 接管下一步" panel now routes provider setup to the user and does not generate scan form state while the provider is unavailable.
  * Reason: Executing plan step 5.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:31:31 CST
  * Step: 6. Pass `providerGate` from AI Money page.
  * Modifications: Extended `buildCommandCenter` and `buildAutonomousCommand` input types in `client/app/(dashboard)/ai-money/client.tsx` and passed the computed `providerGate` to both builders.
  * Change Summary: The page now supplies provider readiness state to both command entrypoints.
  * Reason: Executing plan step 6.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.
* 2026-06-03 14:31:31 CST
  * Step: 7-9. Verify and review.
  * Modifications: Ran `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`; reviewed modified snippets against the plan.
  * Change Summary: Verification passed. Lint retains the known pre-existing warning at `client/data/use-activity-center.tsx:138`.
  * Reason: Executing plan steps 7, 8, and 9.
  * Blockers: None.
  * User Confirmation Status: Pending Confirmation.

## Final Review

Implementation perfectly matches the final plan. The new tests prove blocked, loading, and ready provider states for both command helpers; `aiCommandCenterFromState` returns provider setup/open-link command state before idle scan generation only for blocked/loading gates with no active analysis; `aiAutonomousCommandFromState` passes the gate downstream and preserves provider-specific stages; the AI Money page passes the computed `providerGate`; verification commands passed with only the known existing lint warning.
