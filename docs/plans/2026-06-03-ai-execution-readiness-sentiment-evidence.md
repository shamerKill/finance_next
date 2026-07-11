# AI Execution Readiness Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent thin completed sentiment reviews from letting AI Money execution readiness move into testnet readiness.

**Architecture:** Frontend execution readiness already computes market, sentiment, account, paper, and risk gates in `client/data/ai-goal-preset.mjs`. This increment reuses the shared sentiment evidence helper inside `aiExecutionReadinessFromState` so a `sentiment_review` action only counts when the note covers market direction, public sentiment, and human/crowding/FOMO evidence.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for thin sentiment review evidence

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiExecutionReadinessFromState blocks testnet readiness when sentiment review evidence is thin`, with heated human factors, a strong completed backtest, a complete paper review note, a safe tradeable account, and a thin `sentiment_review` note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic returns `testnet_ready` instead of `sentiment_review`.

### Task 2: Reuse sentiment evidence completion in execution readiness

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Inside `aiExecutionReadinessFromState`, compute `sentimentReviewEvidenceComplete = sentimentReviewCompleted(sentimentReview)`.

Use this value for:
- blocker readiness text
- `sentiment_review` stage branch
- execution readiness score

**Step 2: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Verify frontend integrity

**Files:**
- Read/verify: `client/data/ai-goal-preset.mjs`
- Read/verify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Run frontend checks**

Run from repo root and `client/` as appropriate:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Step 2: Record known warning**

`yarn lint` is expected to exit 0 while still showing the pre-existing warning in `client/data/use-activity-center.tsx:138`.

Implementation Checklist:
1. Add the failing execution readiness test for thin sentiment review evidence.
2. Run the AI goal preset test file and confirm RED.
3. Add `sentimentReviewEvidenceComplete` inside `aiExecutionReadinessFromState`.
4. Replace raw sentiment review `status === "done"` checks in execution readiness with the evidence-complete value.
5. Run the AI goal preset test file and confirm GREEN.
6. Run `yarn typecheck`.
7. Run `yarn lint`.
8. Run `git diff --check`.
