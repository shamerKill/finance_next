# AI Money Brief Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI Money Brief from treating a thin completed sentiment review as trustworthy evidence.

**Architecture:** `aiMoneyBriefFromState` uses `workflowConfidence` for the visible confidence score and `aiMoneyBriefAuditFromState` for ready/warning/blocker copy. This increment makes both paths reuse `sentimentReviewCompleted`, so the brief only marks sentiment as ready when review notes include market direction, public sentiment, and human/crowding/FOMO evidence.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for Brief trust state

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiMoneyBriefFromState keeps thin sentiment review out of ready audit and confidence`, using a heated validated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic adds sentiment confidence and puts the review in ready audit copy.

### Task 2: Reuse sentiment evidence completion in Brief trust helpers

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Change `workflowConfidence` to add the sentiment-review score only when `sentimentReviewCompleted(sentimentReview)` is true.

**Step 2: Update audit copy**

Change `aiMoneyBriefAuditFromState` so thin completed reviews stay in the warning lane instead of ready.

**Step 3: Run test to verify it passes**

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
1. Add the failing AI Money Brief test for thin sentiment review evidence.
2. Run the AI goal preset test file and confirm RED.
3. Update `workflowConfidence` to use `sentimentReviewCompleted`.
4. Update `aiMoneyBriefAuditFromState` to use `sentimentReviewCompleted`.
5. Run the AI goal preset test file and confirm GREEN.
6. Run `yarn typecheck`.
7. Run `yarn lint`.
8. Run `git diff --check`.
