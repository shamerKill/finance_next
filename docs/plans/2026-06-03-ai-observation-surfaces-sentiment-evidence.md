# AI Observation Surfaces Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI observation surfaces from treating thin completed sentiment reviews as enough to adopt paper candidates.

**Architecture:** `aiCommandCenterFromState` exposes evidence status to the operator, while `aiMarketWatchtowerFromState` decides whether the market observation view should stop at sentiment review or move into paper watch. This increment makes both surfaces reuse `sentimentReviewCompleted`, matching the stricter AI Money path, brief, sizing, and execution readiness gates.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for Command Center evidence

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiCommandCenterFromState keeps thin sentiment review evidence current`, using a heated validated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic marks the `human_sentiment` evidence item as `done`.

### Task 2: Add RED coverage for Watchtower

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiMarketWatchtowerFromState keeps thin sentiment review before paper adoption`, using a heated validated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic moves to `paper_watch`.

### Task 3: Reuse sentiment evidence completion

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Update Command Center**

Change `sentimentDone` in `aiCommandCenterFromState` to use `sentimentReviewCompleted(sentimentReview)`.

**Step 2: Update Watchtower**

Change `needsSentimentReview` in `aiMarketWatchtowerFromState` to use `!sentimentReviewCompleted(sentimentReview)`.

**Step 3: Run test to verify it passes**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 4: Verify frontend integrity

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
1. Add the failing Command Center sentiment evidence test.
2. Add the failing Market Watchtower sentiment evidence test.
3. Run the AI goal preset test file and confirm RED.
4. Update `aiCommandCenterFromState` to use `sentimentReviewCompleted`.
5. Update `aiMarketWatchtowerFromState` to use `sentimentReviewCompleted`.
6. Run the AI goal preset test file and confirm GREEN.
7. Run `yarn typecheck`.
8. Run `yarn lint`.
9. Run `git diff --check`.
