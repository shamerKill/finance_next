# AI Goal Composer One-Click Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a vague money-making objective flow directly into AI-safe enrichment plus validation, instead of requiring a separate "apply enrichment" step.

**Architecture:** Keep `aiGoalComposerFromFormState` as the single source of truth for enriching rough goals, capping execution mode to observe/paper, and adding human/market/safety constraints. Change its primary action for rough goals from apply-only to analyze-and-validate, relying on the existing AI Money composer UI path that submits `proposedFormState` to the analysis + validation pipeline.

**Tech Stack:** Next.js client data helpers, React client component, Node test runner, TDD.

### Task 1: Add Failing Composer Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Update the vague-goal composer test to expect the primary action `{kind: "analyze_and_validate", label: "应用补全并验证"}`.
2. Verify the test fails while the helper still returns `apply_suggestion`.

### Task 2: Implement One-Click Enriched Validation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Change the `needs_enrichment` primary action in `aiGoalComposerFromFormState` to `analyze_and_validate`.
2. Use label `应用补全并验证` so the user sees one direct action.
3. Keep the proposed state safety behavior unchanged: symbols inferred, risk capped, execution downgraded to paper, default human/market/avoid constraints filled.

### Task 3: Verify

**Commands:**
- `node --test --test-name-pattern "aiGoalComposerFromFormState enriches vague money goals safely" client/data/ai-goal-preset.test.mjs`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Expected:** Rough goals like "帮我赚钱" can be enriched and sent into the AI analysis + validation pipeline with one primary action, while still preventing direct testnet/mainnet promotion.
