# AI Execution Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI execution preview that shows what AI would do next, what it will not do, and which confirmations still require the user before any real trading.

**Architecture:** Keep the feature as a deterministic frontend projection over the existing AI analysis, validation runs, persisted action queue, and execution readiness. Reuse existing helpers (`nextAIGoalDecision`, `paperCandidateFromValidation`, `aiExecutionReadinessFromState`, `aiAutopilotStateFromAnalysis`) so the preview cannot drift from current safety gates. Render the preview in `/ai-money` as an observation panel with no direct real-trading action.

**Tech Stack:** Next.js React client component, HeroUI controls, local ESM utility tests with `node --test`.

### Task 1: Add Failing Utility Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Import the new helper**

Add `aiExecutionPreviewFromState` to the existing import list.

**Step 2: Write the idle preview failing test**

Add a test asserting that an empty state returns:
- `stage === "idle"`
- primary action `{ kind: "analyze_and_validate", label: "启动 AI 雷达" }`
- `wouldDo` includes AI scanning/generation
- `willNotDo` includes not placing orders
- `requiredHumanConfirmations` includes real-trading confirmation

**Step 3: Write the paper-ready preview failing test**

Add a test with:
- analysis containing non-empty news/macro/onchain context
- a runnable draft with risk caps
- a passing completed validation run
- `sentiment_review` marked done
- backend execution context showing at least one safe tradeable account and portfolio limits

Assert the preview returns:
- `stage === "paper_ready"`
- primary action `{ kind: "accept_paper_candidate", label: "采用为 paper 候选" }`
- `wouldDo` includes adopting the paper candidate
- `willNotDo` includes not entering mainnet
- `requiredHumanConfirmations` includes real trading / paper observation confirmation

**Step 4: Run tests to verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiExecutionPreviewFromState` is not exported.

### Task 2: Implement Preview Projection

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add `aiExecutionPreviewFromState`**

Implement a pure exported function accepting:

```js
{
  analysis = null,
  persistedActions = [],
  validationRuns = [],
  accounts,
} = {}
```

It should compute:
- `decision = nextAIGoalDecision(...)`
- `candidate = paperCandidateFromValidation(...)`
- `readiness = aiExecutionReadinessFromState(...)`
- `autopilot = aiAutopilotStateFromAnalysis(...)`

Return:
- `stage`, `title`, `tone`, `summary`
- `primaryHref`, `primaryAction`
- `wouldDo`, `willNotDo`, `requiredHumanConfirmations`
- `metrics`

**Step 2: Keep safety promises explicit**

Always include that AI will not place real/mainnet orders from this preview. For `paper_ready`, expose adoption as a paper candidate only. For `testnet_ready`, expose opening the strategy preset only. Do not add any hidden execution side effect.

**Step 3: Run tests to verify GREEN**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Render the Preview Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Add `aiExecutionPreviewFromState` to the imports and define an `AIExecutionPreviewState` UI type.

**Step 2: Build preview state**

Compute the preview beside existing `executionReadiness`, passing `accounts: accountsBusy ? undefined : accounts`.

**Step 3: Add `AIExecutionPreviewPanel`**

Render a compact panel near `AIExecutionReadinessPanel` and `AIAutopilotPanel` with:
- status badge for stage
- summary
- metrics
- three `PlanList` columns: AI 会做, AI 不会做, 需要你确认
- primary action button reusing only existing safe actions: scan, run all backtests, accept paper candidate, open link

**Step 4: Run typecheck**

Run: `yarn typecheck` from `client/`

Expected: PASS.

### Task 4: Verification

**Files:**
- No additional edits unless verification fails.

**Step 1: Run focused unit tests**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

**Step 2: Run frontend typecheck**

Run: `yarn typecheck` from `client/`

Expected: PASS.

**Step 3: Run diff whitespace check**

Run: `git diff --check`

Expected: no output.

**Step 4: Browser smoke**

Start the Next dev server and open `/ai-money` in the in-app browser. Expected unauthenticated behavior remains redirect to `/login?next=%2Fai-money`; no runtime build crash.
