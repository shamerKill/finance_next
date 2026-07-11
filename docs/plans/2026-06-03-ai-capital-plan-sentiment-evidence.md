# AI Capital Plan Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI Money from producing a paper sizing plan when heated sentiment only has a thin completed sentiment review note.

**Architecture:** `aiCapitalPlanFromState` decides whether a validated candidate can receive a recommended notional and daily loss plan. This increment makes its sentiment gate reuse the shared `sentimentReviewCompleted` helper, so sizing remains blocked until the review note covers market direction, public sentiment, and human/crowding/FOMO evidence.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for capital sizing

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiCapitalPlanFromState blocks paper sizing when sentiment review evidence is thin`, using a heated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic returns `paper_sizing` instead of `review_before_sizing`.

### Task 2: Reuse sentiment evidence completion for sizing

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Change `aiCapitalPlanFromState` so `needsReview` is true when sentiment is heated and `sentimentReviewCompleted(sentimentReview)` is false.

**Step 2: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 3: Verify frontend integrity

**Files:**
- Read/verify: `client/data/ai-goal-preset.mjs`
- Read/verify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Run frontend checks**

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Step 2: Record known warning**

`yarn lint` is expected to exit 0 while still showing the pre-existing warning in `client/data/use-activity-center.tsx:138`.

Implementation Checklist:
1. Add the failing capital sizing test for thin sentiment review evidence.
2. Run the AI goal preset test file and confirm RED.
3. Replace raw `sentiment_review` status logic in `aiCapitalPlanFromState`.
4. Run the AI goal preset test file and confirm GREEN.
5. Run `yarn typecheck`.
6. Run `yarn lint`.
7. Run `git diff --check`.
