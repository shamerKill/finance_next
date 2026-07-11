# AI Saved Strategy Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a concrete AI handoff checklist after an AI-generated strategy draft is saved.

**Architecture:** Derive the checklist from already-loaded strategy detail data: the saved strategy, accounts, and recent backtests. Keep this as a pure helper in `client/data/ai-goal-preset.mjs` so behavior is testable and shared with future AI Money surfaces.

**Tech Stack:** Next.js server component, existing strategy detail page, Node test runner.

### Task 1: Add Pure Handoff Behavior

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Test: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests for `aiSavedStrategyHandoffFromState()`:

- A saved AI strategy with live disabled but no backtests should stage as `needs_backtest`.
- A saved AI strategy with completed backtest, risk caps, and safe account should stage as `paper_review`.

**Step 2: Run test to verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: fail because `aiSavedStrategyHandoffFromState` is not exported.

**Step 3: Implement helper**

Implement `aiSavedStrategyHandoffFromState({ strategy, accounts, backtests })` with these derived items:

- `live_off`
- `backtest`
- `risk_caps`
- `safe_account`
- `paper_watch`

### Task 2: Render Handoff on Strategy Detail

**Files:**
- Modify: `client/app/(dashboard)/strategies/[id]/page.tsx`

**Step 1: Import helper**

Import `aiSavedStrategyHandoffFromState` from `client/data/ai-goal-preset.mjs`.

**Step 2: Add panel**

Create `SavedStrategyHandoffPanel` to render stage, summary, checklist items, primary action, and AI next steps.

**Step 3: Show only for AI drafts**

Render the panel only when `searchParams.from === "ai-draft"`.

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

Start `yarn dev --hostname 127.0.0.1 --port 3000`, request an AI draft strategy detail route, verify protected redirect/compile behavior, then stop the dev server and confirm port 3000 has no listener.
