# AI Money Path Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the AI Money visible path at the sentiment review step when a heated candidate only has a thin completed sentiment review note.

**Architecture:** `aiMoneyPathFromState` builds the user-facing sequence of scan, evidence, blueprint, validation, sentiment, paper, and testnet steps. This increment makes the path use the shared `sentimentReviewCompleted` evidence helper, and blocks paper adoption actions until the sentiment review note covers market direction, public sentiment, and human/crowding/FOMO evidence.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for AI Money Path

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiMoneyPathFromState keeps thin sentiment review at the sentiment step`, using a heated validated candidate and a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic makes the current step `paper` and exposes `accept_paper_candidate`.

### Task 2: Reuse sentiment evidence completion in the visible path

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Change `sentimentNeedsReview` in `aiMoneyPathFromState` to use `!sentimentReviewCompleted(sentimentReview)`.

**Step 2: Block premature paper adoption**

When `sentimentNeedsReview` is true, set the paper step to `blocked`, update its detail to explain the missing sentiment evidence, and suppress `accept_paper_candidate`.

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
1. Add the failing AI Money Path test for thin sentiment review evidence.
2. Run the AI goal preset test file and confirm RED.
3. Replace raw `sentiment_review` status logic in `aiMoneyPathFromState`.
4. Block the paper step and suppress `accept_paper_candidate` while sentiment evidence is incomplete.
5. Run the AI goal preset test file and confirm GREEN.
6. Run `yarn typecheck`.
7. Run `yarn lint`.
8. Run `git diff --check`.
