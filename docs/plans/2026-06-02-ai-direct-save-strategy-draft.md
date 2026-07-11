# AI Direct Save Strategy Draft Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI Money page save a generated Grid DCA strategy draft directly as a credentialless strategy configuration.

**Architecture:** Reuse the existing AI draft normalization path so direct-save and `/option` prefill produce the same capped parameters. Keep the action safe: saving creates a disabled strategy configuration only; it does not enable live execution or submit orders.

**Tech Stack:** Next.js App Router, React client component, HeroUI buttons, existing REST `POST /api/v1/option`, Node test runner for pure helper coverage.

### Task 1: Add a Payload Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Test: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add tests proving `optionPayloadFromStrategyDraft()` converts a Grid DCA AI draft into a credentialless `TypeOption`-compatible payload and refuses watch-only drafts.

**Step 2: Run the test**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: fail because `optionPayloadFromStrategyDraft` is not exported.

**Step 3: Implement the helper**

Create `optionPayloadFromStrategyDraft(draft)` beside `strategyPresetSearchFromDraft()`. It should reuse `strategyPresetFromDraft()` so leverage, order margin, symbol, positions, booleans, and risk caps stay aligned with the `/option` prefill path.

**Step 4: Run the test again**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: pass.

### Task 2: Wire the AI Money Save Action

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import the existing APIs**

Import `createOption`, `optionCreateRedirectHref`, and `optionPayloadFromStrategyDraft`.

**Step 2: Add save state and handler**

Add `strategySaveBusyKey` plus `saveStrategyDraft(draft)`. The handler builds the payload, posts it with `createOption`, updates the AI run `strategy` action to `done`, and routes to `/strategies/:id?from=ai-draft`.

**Step 3: Add buttons**

Expose "保存草案" from both the action queue strategy item and each executable draft card. Keep "预填策略" available as the manual inspection path.

### Task 3: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
node --test client/data/auth-redirect.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Smoke:

Start `yarn dev --hostname 127.0.0.1 --port 3000`, request `/ai-money`, verify protected redirect behavior, then stop the dev server and confirm port 3000 has no listener.
