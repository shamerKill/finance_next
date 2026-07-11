# AI Frontend Sentiment Evidence Reopen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep old thin `sentiment_review done` records from letting AI Money skip market direction, public opinion, and human-bias review.

**Architecture:** The backend now rejects thin `sentiment_review done` writes, but older persisted run actions may still contain generic completion notes. The frontend action overlay and `nextAIGoalDecision` must treat those thin notes as unresolved, while preserving legacy no-note test fixtures as already reviewed.

**Tech Stack:** Next.js shared AI goal helper module, Node.js built-in test runner.

## Context

`manualActionTransition` now writes an evidence-backed sentiment review note. However, existing run history can still have notes like `风向 / 人性复核已完成。`. Without frontend checking, the action queue and next-decision helper can treat that record as complete and allow paper adoption.

## Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Action queue test**

Add `actionPlanFromAnalysis reopens thin completed sentiment review evidence`. It passes a persisted `sentiment_review` action with `status: "done"` and a generic note. Expected: the action is reopened as `manual` with a note mentioning evidence gaps for market direction, public opinion, and human bias.

**Step 2: Decision helper test**

Extend the heated-candidate decision test so a generic `sentiment_review done` note still returns `stage: "sentiment_review"` instead of `paper_candidate`.

**Step 3: Run test to verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because current frontend code only checks `status === "done"`.

### Task 2: Implement Frontend Evidence Checking

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add `sentimentReviewCompletionHasEvidence(action)` requiring:
- market direction
- public opinion / sentiment
- human bias / FOMO / crowding

Keep empty notes compatible with existing tests, but reject generic non-empty notes.

**Step 2: Reopen thin action queue entries**

Update `overlayPersistedActions` to reopen thin completed `sentiment_review` records as `manual`.

**Step 3: Block paper adoption on thin review notes**

Update `nextAIGoalDecision` to use `sentimentReviewCompleted(action)` rather than raw `status === "done"`.

## Implementation Checklist:

1. Add action queue RED test for thin `sentiment_review done`.
2. Add next-decision RED test for thin `sentiment_review done`.
3. Run frontend helper tests and confirm RED.
4. Implement sentiment evidence helper.
5. Wire helper into action overlay.
6. Wire helper into `nextAIGoalDecision`.
7. Re-run frontend tests and static checks.

## Task Progress

* 2026-06-03 05:07:15 CST
  * Step: 1-6
  * Modifications: Added RED tests, frontend sentiment evidence helper, action queue reopen behavior, and core next-decision evidence check.
  * Change Summary: Thin non-empty sentiment review notes no longer count as completed review evidence in the frontend.
  * Reason: Preserve market direction, public opinion, and human-bias review as real gates before AI paper adoption.
  * Blockers: None
