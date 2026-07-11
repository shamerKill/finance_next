# AI Paper Evidence Observation Surfaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep every AI money observation surface from treating a thin `paper_watch` completion note as sufficient evidence.

**Architecture:** Reuse the existing `paperWatchCompletionHasEvidence` contract across helper surfaces that summarize AI readiness. A `paper_watch` action with `status: "done"` is only success-ready when its note covers market direction, public sentiment, human/crowding/FOMO risk, execution friction, drawdown review, and the testnet-only boundary.

**Tech Stack:** Next.js client data helpers, Node test runner, TDD.

### Task 1: Add RED Coverage For Thin Paper Evidence

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Add failing tests for `aiOperatorRhythmFromState`, `aiDelegationRunbookFromState`, `aiMoneyBriefFromState`, and `aiDecisionJournalFromState`.
2. Use a `paper_watch` action with `status: "done"` and note `Paper 已完成`.
3. Verify the tests fail because helper surfaces still show success, handoff, ready audit, or full confidence.

### Task 2: Reuse Paper Evidence Completion In Helper Surfaces

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Add local `paperWatchEvidenceComplete` derived values beside existing `paperWatch` lookups.
2. Keep operator rhythm in warning state when completion evidence is thin.
3. Keep delegation runbook in paper review instead of testnet/paper handoff when completion evidence is thin.
4. Show decision journal paper entries as warning with explicit missing evidence copy.
5. Award Brief confidence and audit ready status only when paper completion evidence is complete.

### Task 3: Verify

**Commands:**
- `node --test --test-name-pattern "thin completed paper watch" client/data/ai-goal-preset.test.mjs`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Expected:** Thin paper evidence remains a review task everywhere; complete evidence can still advance to testnet pre-check only.
