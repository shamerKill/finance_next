# AI Goal Composer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI goal composer that turns a rough user goal into a safe, analysis-ready AI money objective with symbols, horizon, risk preference, behavior constraints, narrative focus, and avoid scenarios.

**Architecture:** Implement a deterministic frontend helper that inspects the current form state and recent runs, proposes a safer enriched form state, and explains missing pieces. Render it in `/ai-money` as a form-side panel with safe actions to apply the suggestion or run analysis. No order execution or backend behavior is changed.

**Tech Stack:** Next.js client component, HeroUI buttons, local ESM tests through `node --test`.

### Task 1: Add Failing Composer Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import the new helper**

Add `aiGoalComposerFromFormState` to the existing import list.

**Step 2: Write a generic-goal test**

Call `aiGoalComposerFromFormState` with a vague goal such as `帮我赚钱`, empty symbols and horizon, and recent runs containing BTC/ETH. Assert:
- `stage === "needs_enrichment"`
- `proposedFormState.goal` includes market, sentiment, human bias, and paper validation
- symbols are filled from recent run context or safe defaults
- execution mode is capped to `paper`
- primary action is `apply_suggestion`
- missing items mention target/symbol or horizon

**Step 3: Write an analysis-ready goal test**

Call with a detailed goal, symbols, horizon, risk preference, execution mode `mainnet`, and empty operator fields. Assert:
- `stage === "ready"`
- proposed execution mode is still `paper`
- operator fields are filled with safe defaults
- primary action is `analyze_and_validate`
- checks include human, narrative, and avoid coverage

**Step 4: Verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiGoalComposerFromFormState` is not exported.

### Task 2: Implement Composer Projection

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add default operator constants**

Move reusable default behavior/narrative/avoid text values into exported constants so both the helper and UI can share them.

**Step 2: Add `aiGoalComposerFromFormState`**

Accept:

```js
{
  state = {},
  runs = [],
  now = new Date(),
} = {}
```

Return:
- `stage`
- `title`
- `tone`
- `summary`
- `proposedFormState`
- `checks`
- `missing`
- `primaryAction`

**Step 3: Composer rules**

- Vague/short goals should become a safe daily AI opportunity objective.
- Missing symbols should be inferred from recent runs, then fall back to BTC/ETH/SOL.
- Missing horizon should fall back to `24h-7d` for vague goals or `1-4 weeks` for detailed goals.
- Execution mode must be capped to `observe` or `paper`; `testnet`/`mainnet` become `paper`.
- Empty behavior/narrative/avoid fields get default safe constraints.
- The helper must not claim profit or expose a real-trading action.

**Step 4: Verify GREEN**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Render Composer Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper and constants**

Import `aiGoalComposerFromFormState` and exported default text constants.

**Step 2: Build composer state**

Compute from current form state and saved runs.

**Step 3: Add `AIGoalComposerPanel`**

Render above the goal text area:
- status badge
- summary
- checks and missing lists
- preview of proposed goal / symbols / horizon / mode
- primary action:
  - `apply_suggestion`: apply proposed form state
  - `analyze_and_validate`: analyze proposed form state and launch validation

**Step 4: Verify typecheck**

Run: `yarn typecheck` from `client/`

Expected: PASS.

### Task 4: Final Verification

**Step 1: Focused tests**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

**Step 2: Typecheck**

Run: `yarn typecheck` from `client/`

Expected: PASS.

**Step 3: Whitespace check**

Run: `git diff --check`

Expected: no output.

**Step 4: Browser smoke**

Start Next dev server and open `/ai-money`. Unauthenticated state should still redirect to `/login?next=%2Fai-money` without runtime errors.
