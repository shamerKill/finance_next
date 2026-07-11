# AI Rhythm And Thesis Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep AI operator rhythm and thesis invalidation from treating thin completed sentiment reviews as enough to adopt paper candidates.

**Architecture:** `aiOperatorRhythmFromState` controls the operator cadence, while `aiThesisInvalidationFromState` decides whether a paper thesis still needs pressure testing. This increment makes both paths reuse `sentimentReviewCompleted`, aligning them with the stricter AI Money path, brief, command center, watchtower, capital plan, and execution readiness gates.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for Operator Rhythm

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiOperatorRhythmFromState keeps thin sentiment review in slow down cadence`, using a heated validated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic returns `paper_candidate`.

### Task 2: Add RED coverage for Thesis Invalidation

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiThesisInvalidationFromState keeps thin sentiment review in pressure test`, using a heated validated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic returns `watch_thesis`.

### Task 3: Reuse sentiment evidence completion

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Update Operator Rhythm**

Change the slow-down condition in `aiOperatorRhythmFromState` to use `!sentimentReviewCompleted(sentimentReview)`.

**Step 2: Update Thesis Invalidation**

Change the pressure-test condition in `aiThesisInvalidationFromState` to use `!sentimentReviewCompleted(sentimentReview)`.

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
1. Add the failing Operator Rhythm sentiment evidence test.
2. Add the failing Thesis Invalidation sentiment evidence test.
3. Run the AI goal preset test file and confirm RED.
4. Update `aiOperatorRhythmFromState` to use `sentimentReviewCompleted`.
5. Update `aiThesisInvalidationFromState` to use `sentimentReviewCompleted`.
6. Run the AI goal preset test file and confirm GREEN.
7. Run `yarn typecheck`.
8. Run `yarn lint`.
9. Run `git diff --check`.
