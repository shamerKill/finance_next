# AI Paper Adoption Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make a ready AI paper candidate easier to adopt by grouping strategy saving, paper handoff, and observation boundaries into one clear package.

**Architecture:** Add a pure `aiPaperAdoptionPackageFromState()` helper that reuses `paperCandidateFromValidation()`, `paperCandidateWithCapitalPlan()`, existing persisted action state, and safe strategy href generation. Render a compact panel near the top of AI Money only when a paper candidate exists.

**Tech Stack:** Plain JavaScript helper, Next.js client component, Node test runner, TypeScript local component types.

### Task 1: Data Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write the failing hidden test**

Add a test asserting `aiPaperAdoptionPackageFromState({ analysis: null })` returns `null`.

**Step 2: Write the failing ready-candidate test**

Add a test with:
- completed validation run that ranks as `优先 paper`
- strategy draft with riskCaps
- completed sentiment review action

Assert helper returns:
- `stage: "ready_to_package"`
- candidate strategy id/name
- primary action `{ kind: "accept_paper_candidate", label: "采用 paper 候选" }`
- secondary action `{ kind: "save_strategy_draft", label: "保存 AI 策略草案" }`
- steps containing strategy save, paper observation, and execution boundary
- risk summary mentioning max position/leverage/daily loss

**Step 3: Run test to verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `aiPaperAdoptionPackageFromState` is not exported yet.

**Step 4: Implement helper**

Add `aiPaperAdoptionPackageFromState({ analysis, persistedActions, validationRuns, capitalPlan, aiRunId })`.

Implementation notes:
- Use `paperCandidateFromValidation(analysis, validationRuns)`.
- If capital plan is `paper_sizing`, pass the candidate through `paperCandidateWithCapitalPlan()`.
- If `aiRunId` exists, use `strategyHrefWithAIRunId(candidate.strategyHref, aiRunId)`.
- Mark saved strategy status from persisted action id `strategy`.
- Return `null` when no candidate exists.

**Step 5: Verify helper**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: UI Panel

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Import helper**

Add `aiPaperAdoptionPackageFromState` to the imports from `@/data/ai-goal-preset.mjs`.

**Step 2: Add local type**

Add `AIPaperAdoptionPackageState` and step/action types.

**Step 3: Build state**

Build `paperAdoptionPackage` after `capitalPlan` and `capitalSizedCandidate`.

**Step 4: Render panel**

Add `AIPaperAdoptionPackagePanel` near the top, after `AIObservationFocusPanel`.

Panel behavior:
- hidden when state is `null`
- primary button calls `onAcceptPaperCandidate(candidate)`
- secondary button calls `onSaveStrategyDraft(candidate.draft)`
- link opens prefilled strategy href
- display steps and guardrails

**Step 5: Verify**

Run:
- `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

## Task Progress

* 2026-06-03 09:48:54 CST
  * Step: Task 1 and Task 2 complete
  * Modifications:
    * `client/data/ai-goal-preset.test.mjs`: added RED tests for hidden state and ready paper candidate packaging.
    * `client/data/ai-goal-preset.mjs`: added `aiPaperAdoptionPackageFromState()` to package paper candidate adoption, strategy saving, risk summary, and execution boundaries.
    * `client/app/(dashboard)/ai-money/client.tsx`: imported the helper, added local package types, built `paperAdoptionPackage`, and rendered `AIPaperAdoptionPackagePanel` near the top of AI Money.
  * Change Summary: Ready AI paper candidates now appear as a single adoption package with save strategy, adopt paper, and safety boundary steps.
  * Reason: Continue moving toward an AI-assisted money workflow where AI-generated strategies are easier to adopt safely after validation.
  * Blockers: None. `yarn lint` still reports the pre-existing unrelated unused eslint-disable warning in `client/data/use-activity-center.tsx:138`.
  * User Confirmation Status: Pending Confirmation

## Final Review

Implementation matches the plan. RED first failed because `aiPaperAdoptionPackageFromState` was not exported. After implementation, the helper tests, combined AI Money workflow tests, TypeScript check, lint, and diff whitespace check completed successfully. No unreported deviations were found.
