# AI Capital Plan Paper Adoption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make paper candidate adoption use the AI capital sizing plan instead of the raw paper candidate risk caps.

**Architecture:** Keep sizing as a pure helper in `client/data/ai-goal-preset.mjs` so tests can verify behavior without rendering the page. The AI Money page will derive one adoption candidate from `radarCandidate + capitalPlan` and pass it to every panel that can accept a paper candidate.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage For Sized Paper Candidate

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test that imports `paperCandidateWithCapitalPlan`, builds a raw paper candidate with `riskCaps.maxPositionUsd = 400` and `dailyLossCapUsd = 40`, applies a `paper_sizing` capital plan with `recommendedNotionalUsd = 200` and `maxDailyLossUsd = 18`, and asserts:

- returned candidate is a new object
- returned draft risk caps use `200` and `18`
- `maxLeverage` is preserved
- `strategyHref` query params use the sized caps
- the original candidate is not mutated
- non-`paper_sizing` plans return the original candidate

**Step 2: Run the focused test to verify RED**

Run: `node --test --test-name-pattern "paperCandidateWithCapitalPlan" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `paperCandidateWithCapitalPlan` is not exported yet.

### Task 2: Implement The Pure Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Add `paperCandidateWithCapitalPlan(candidate, capitalPlan)` near `aiCapitalPlanFromState`:

- return `null` if candidate is missing
- return original candidate when `capitalPlan.stage !== "paper_sizing"`
- copy `candidate.draft.riskCaps`
- set `maxPositionUsd` from `capitalPlan.recommendedNotionalUsd` when positive
- set `dailyLossCapUsd` from `capitalPlan.maxDailyLossUsd` when positive
- set `draft.params.orderGroupMargin` from `capitalPlan.recommendedNotionalUsd` when positive
- preserve leverage and other candidate fields
- rebuild `strategyHref` from the updated draft via `strategyPresetSearchFromDraft`

**Step 2: Run focused test to verify GREEN**

Run: `node --test --test-name-pattern "paperCandidateWithCapitalPlan" client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Wire AI Money Adoption Entrypoints

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import and type the helper**

Import `paperCandidateWithCapitalPlan` from `@/data/ai-goal-preset.mjs` and cast it beside other local builder helpers.

**Step 2: Derive the adoption candidate**

After `capitalPlan`, create `capitalSizedCandidate = buildSizedPaperCandidate(radarCandidate, capitalPlan)`.

**Step 3: Use it consistently**

Replace every panel prop `candidate={radarCandidate}` that also receives `onAcceptPaperCandidate={acceptPaperCandidate}` with `candidate={capitalSizedCandidate}`.

### Task 4: Verify

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `gateway/internal/http/handlers`
- Check: `client`

**Step 1: Run focused tests**

Run: `node --test --test-name-pattern "paperCandidateWithCapitalPlan" client/data/ai-goal-preset.test.mjs`

**Step 2: Run AI helper tests**

Run: `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`

**Step 3: Run Go handler tests**

Run from `gateway`: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`

**Step 4: Run frontend checks**

Run from `client`: `yarn typecheck` and `yarn lint`

**Step 5: Run diff hygiene**

Run: `git diff --check`

### Execution Notes

- RED confirmed with `node --test --test-name-pattern "paperCandidateWithCapitalPlan" client/data/ai-goal-preset.test.mjs`: failed because the helper export did not exist.
- Added `paperCandidateWithCapitalPlan` to copy paper candidates and apply AI paper sizing to `riskCaps.maxPositionUsd`, `riskCaps.dailyLossCapUsd`, and `params.orderGroupMargin`.
- Updated AI Money panels that can accept paper candidates to receive the sized candidate.
- Verified with Node tests, Go handler tests, frontend typecheck, frontend lint, and `git diff --check`.
