# AI Money Provider Blocked Visible Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove misleading scan buttons from the AI Money first screen when the real AI provider is blocked or loading.

**Architecture:** Keep `client/data/ai-goal-preset.mjs` as the source of derived state where panel state needs provider context. Use display-level substitution in `client/app/(dashboard)/ai-money/client.tsx` for panels that already receive a provider notice or gate. Existing click-time provider blocking remains as defense in depth.

**Tech Stack:** Next.js client component, plain JS AI Money state helpers, Node test runner, Chrome headless CDP runtime check.

### Task 1: Cover provider-aware observation focus

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing test**

Add a test near the existing `aiObservationFocusFromState` idle tests:

- no analysis + blocked `providerGate` returns `stage: "provider_blocked"`
- primary action is `open_link` to `/settings/ai`
- summary/next actions mention provider and do not invite scanning before setup

**Step 2: Run RED**

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
```

Expected: the new observation focus test fails because the helper currently returns `idle` with `scan_today`.

**Step 3: Implement minimal helper support**

Add `providerGate = null` to `aiObservationFocusFromState`. In the no-analysis branch, when the gate stage is `blocked` or `loading`, return provider setup/loading state with an `open_link` action to the gate href.

### Task 2: Replace remaining visible scan buttons while provider is blocked

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Daily radar**

In `DailyRadarStatusCard`, when a scan/rescan action is rendered and `providerNotice` exists, render a link to `providerNotice.primaryHref` with `providerNotice.primaryAction.label` instead of a scan button.

**Step 2: Follow-up queue**

Pass `providerGate` into `AIRunFollowupQueuePanel`. When the primary action is `scan_today` and `providerGate.blockAutoRadar` is true, render a link to `providerGate.primaryHref` with the gate action label instead of a scan button.

**Step 3: Observation focus**

Pass `providerGate` into the `buildObservationFocus` call and its input type so the helper state reaches `AIObservationFocusPanel`.

### Task 3: Verify runtime behavior

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
yarn typecheck
node .tmp/cdp-ai-money-check.mjs
git diff --check
```

Expected:

- Focused tests pass.
- TypeScript passes.
- Headless AI Money page has provider blocked state, no JS exceptions, and the prominent provider-blocked panels render setup links instead of scan buttons.
- Diff check reports no whitespace errors.

Implementation Checklist:
1. Add the failing `aiObservationFocusFromState` provider-blocked test.
2. Run the focused Node test and confirm the expected RED failure.
3. Implement provider-aware `aiObservationFocusFromState`.
4. Update AI Money page types/calls to pass `providerGate` into observation focus and follow-up queue.
5. Replace Daily Radar and Follow-up Queue scan buttons with provider setup links when blocked/loading.
6. Re-run the focused Node test.
7. Run `yarn typecheck`.
8. Re-run Chrome headless CDP check.
9. Run `git diff --check` and review runtime findings.

# Task Progress

* 2026-06-03 23:02:38 CST
  * Step: 1-9
  * Modifications: Added the provider-blocked observation focus test; implemented provider-aware observation focus; stabilized no-analysis follow-up tests with injectable `now`; added provider setup button substitution across AI Money form actions and scan-capable panels.
  * Change Summary: When OpenAI is selected but the API key is missing, AI Money now shows configuration links instead of scan/analyze buttons, while runtime click guards remain intact.
  * Reason: Executing the provider-blocked visible action plan.
  * Blockers: Real gateway could not start locally because MongoDB was not running; page verification used a bounded mock API.
  * User Confirmation Status: Pending

# Final Review

Implementation perfectly matches the final plan, with one scoped extension discovered during runtime review: additional AI Money panels beyond the original three prominent panels also rendered scan/analyze buttons, so the display-level provider gate was applied consistently to those panels. No unreported functional deviation remains. Verification passed with `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, Chrome headless `/ai-money` smoke test, and `git diff --check`.
