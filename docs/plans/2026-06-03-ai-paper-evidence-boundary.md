# AI Paper Evidence Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Require paper review evidence to include drawdown performance and a testnet-only boundary before AI can surface testnet readiness.

**Architecture:** Keep the existing paper evidence helper as the single gate for completion, then add the same evidence lanes to the paper review coach so the UI tells the operator exactly what is missing. This keeps readiness, brief, decision, and coach surfaces aligned.

**Tech Stack:** Next.js client data helpers, Node test runner, TDD.

### Task 1: Add Failing Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Add a paper review coach test where the note covers 24-72h, market direction, sentiment, human bias, and execution friction, but omits drawdown and testnet/mainnet boundary.
2. Add an execution readiness test with the same incomplete note and otherwise valid account, risk, context, and backtest evidence.
3. Verify both tests fail: the coach incorrectly reports `review_complete`, and readiness incorrectly reports `testnet_ready`.

### Task 2: Extend Evidence Requirements

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Steps:**
1. Extend `paperWatchCompletionHasEvidence` with drawdown and testnet/mainnet boundary keyword groups.
2. Add `drawdown` and `testnet_boundary` paper review coach items.
3. Update execution readiness missing-evidence copy and primary action label so the operator sees "补齐 paper 复盘" instead of a generic view action.

### Task 3: Verify

**Commands:**
- `node --test --test-name-pattern "drawdown and testnet boundary evidence|without drawdown and testnet boundary evidence" client/data/ai-goal-preset.test.mjs`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `yarn lint`
- `git diff --check`

**Expected:** Incomplete paper evidence cannot unlock testnet readiness, and the coach lists the missing drawdown and boundary evidence.
