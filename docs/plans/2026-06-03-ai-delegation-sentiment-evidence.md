# AI Delegation Sentiment Evidence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the AI delegation runbook at human review when a heated candidate only has a thin completed sentiment review note.

**Architecture:** `aiDelegationRunbookFromState` tells the operator whether AI should validate, wait, hand off paper adoption, or ask for human review. This increment makes its human-review branch use `sentimentReviewCompleted`, matching the stricter execution readiness and capital sizing gates.

**Tech Stack:** Next.js client helper module, Node test runner.

### Task 1: Add RED coverage for delegation runbook

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add `aiDelegationRunbookFromState keeps thin sentiment review at human review`, using a heated validated candidate plus a thin `sentiment_review` done note.

**Step 2: Run test to verify it fails**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because old logic returns `paper_handoff` instead of `human_review`.

### Task 2: Reuse sentiment evidence completion in delegation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write minimal implementation**

Change the `needsHumanReview` condition in `aiDelegationRunbookFromState` to require `!sentimentReviewCompleted(sentimentReview)` instead of raw status.

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
1. Add the failing delegation runbook test for thin sentiment review evidence.
2. Run the AI goal preset test file and confirm RED.
3. Replace raw `sentiment_review` status logic in `aiDelegationRunbookFromState`.
4. Run the AI goal preset test file and confirm GREEN.
5. Run `yarn typecheck`.
6. Run `yarn lint`.
7. Run `git diff --check`.
