# AI Follow-up Thin Paper Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep AI follow-up focused on paper reviews that were marked complete without enough evidence.

**Architecture:** The follow-up queue ranks AI runs by the next safest action. A completed `paper_watch` action is only complete when its note contains the required evidence lanes; otherwise the queue should pull it back into paper review with high priority.

**Tech Stack:** Next.js helper module, Node test runner.

## Analysis

`client/data/ai-goal-preset.mjs::activeRunAction` excludes `done` actions. That meant `aiRunFollowupItem` ignored a `paper_watch` marked `done` even when `paperWatchCompletionHasEvidence` would reject the note. The AI follow-up queue could then show a lower-priority validation or routine item instead of asking the user to complete market, sentiment, human-bias, and execution-friction evidence.

## Implementation Checklist

1. Add a test in `client/data/ai-goal-preset.test.mjs` for a run with `paper_watch.status = done` and a thin note.
2. Confirm the new test fails because the old queue returns `run_validation`.
3. Update `client/data/ai-goal-preset.mjs::aiRunFollowupItem` to detect `done` paper watches without required evidence.
4. Return a high-priority `paper_watch` follow-up item titled `补齐 paper 复盘证据`.
5. Keep normal active `paper_watch` behavior unchanged.
6. Run `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`.

## Task Progress

* 2026-06-03
  * Step: Thin completed paper watch follow-up.
  * Modifications: Added a regression test and updated follow-up ranking.
  * Change Summary: AI follow-up now reopens thin completed paper reviews instead of letting them fall through to lower-priority actions.
  * Reason: The project goal requires AI to keep users inside evidence-driven observation before any execution gate.
  * Blockers: None.

## Final Review

Implementation matches the plan. The RED test failed with `run_validation` instead of `paper_watch`. After the helper update, `node --test client/data/ai-goal-preset.test.mjs` passed with 132/132 tests. Frontend typecheck passed. Frontend lint exited 0 with the existing `client/data/use-activity-center.tsx` unused eslint-disable warning.
