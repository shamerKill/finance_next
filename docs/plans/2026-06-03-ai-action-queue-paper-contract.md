# AI Action Queue Paper Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the visible AI action queue aligned with the backend paper-evidence execution contract.

**Architecture:** The AI Money page uses `actionPlanFromAnalysis` for the operator-facing action queue. That queue must match the backend default action contract by inserting a blocked `paper_watch` step before execution gates and keeping the gate blocked until paper review evidence exists.

**Tech Stack:** Next.js helper module, Node test runner.

## Analysis

`client/data/ai-goal-preset.mjs::actionPlanFromAnalysis` still used the older queue model: tradable drafts jumped from strategy prefill to gate, and `testnet` / `mainnet` modes could mark gate as `manual`. This contradicted the backend and the newer current-task panel, both of which require paper observation evidence before testnet or mainnet review.

## Implementation Checklist

1. Update `client/data/ai-goal-preset.test.mjs` so the default action plan for a tradable AI draft includes `paper_watch` before `gate`.
2. Assert the default paper watch detail names 24-72 hour observation, sentiment, and execution friction evidence.
3. Assert watch-only drafts do not create a default paper watch step.
4. Assert persisted `paper_watch` state overlays the default item without duplication.
5. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED failure against the old queue.
6. Update `client/data/ai-goal-preset.mjs::actionPlanFromAnalysis` to add a blocked `paper_watch` item for tradable drafts.
7. Keep `gate` blocked by default and include paper review evidence in its detail.
8. Preserve persisted paper watch actions when the current analysis no longer has a default paper watch item.
9. Run `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`.

## Task Progress

* 2026-06-03
  * Step: Action queue paper evidence contract sync.
  * Modifications: Updated helper tests and `actionPlanFromAnalysis` queue generation.
  * Change Summary: The visible AI action queue now blocks execution gates behind 24-72 hour paper observation evidence.
  * Reason: Prevent the user-facing queue from implying that execution can move forward before market, sentiment, human-bias, and execution-friction review.
  * Blockers: None.

## Final Review

Implementation matches the plan. The RED test failed because `paper_watch` was missing and gate was still manual. After the helper update, `node --test client/data/ai-goal-preset.test.mjs` passed with 131/131 tests. Frontend typecheck passed. Frontend lint exited 0 with the existing `client/data/use-activity-center.tsx` unused eslint-disable warning.
