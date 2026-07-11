# AI Strategy Creation Summary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make each AI strategy draft easier to turn into a saved strategy by showing the exact creation readiness, prefill target, risk caps, and manual confirmations before the user opens `/option`.

**Architecture:** Add a pure helper in `client/data/ai-goal-preset.mjs` that converts a strategy draft into a creation summary. Render that summary inside each AI draft card on `/ai-money` without changing backend execution or credential rules.

**Tech Stack:** Next.js client UI, JavaScript pure helper tests via `node --test`, existing HeroUI/Section/StatusBadge components.

### Task 1: Pure Creation Summary Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing tests**

Add tests for:
- A valid grid DCA draft returns `stage="ready_to_prefill"`, an `/option?source=ai-goal...` href, AI-prepared fields, risk caps, and required human credential confirmations.
- A `watch_only` or missing-risk draft returns a warning/blocker state and does not advertise direct saving as ready.

**Step 2: Verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiStrategyCreationSummaryFromDraft` is not exported.

**Step 3: Implement helper**

Add `aiStrategyCreationSummaryFromDraft({ analysis, draft })` next to existing draft/backtest helpers. It should reuse `strategyPresetSearchFromDraft`, `backtestRequestFromDraft`, `normalizeRiskCaps`, `money`, and safe list helpers where possible.

**Step 4: Verify GREEN**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: Draft Card UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Import `aiStrategyCreationSummaryFromDraft` and add a small local state type for the returned summary.

**Step 2: Render creation summary**

Inside `DraftBlock`, compute the creation summary and render a compact panel below the existing evidence panel with:
- status badge,
- summary text,
- key metrics,
- AI prepared list,
- user required list,
- blockers list,
- primary link to `/option` when available.

**Step 3: Verify TypeScript**

Run: `yarn typecheck` from `client/`.

Expected: PASS.

### Task 3: Final Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `git diff --check`
- Browser smoke for `/ai-money` to confirm the page still renders or redirects through auth as expected.
