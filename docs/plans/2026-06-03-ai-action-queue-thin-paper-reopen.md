# AI Action Queue Thin Paper Reopen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent the AI action queue from showing a paper watch as complete when its review evidence is insufficient.

**Architecture:** `actionPlanFromAnalysis` overlays persisted run actions onto the visible queue through `overlayPersistedActions`. The overlay layer should preserve saved links and notes, but downgrade thin completed `paper_watch` actions back to manual review.

**Tech Stack:** Next.js helper module, Node test runner.

## Analysis

Other AI Money helpers already reject `paper_watch.status = done` when the note does not contain 24-72 hour, market direction, sentiment, human-bias, and execution-friction evidence. The visible action queue still trusted the persisted `done` status blindly, so a user could see `Paper 观察与复盘` as complete even though other panels still blocked execution.

## Implementation Checklist

1. Add a test in `client/data/ai-goal-preset.test.mjs` for `actionPlanFromAnalysis` with a `done` paper watch and a thin note.
2. Confirm the test fails because the current queue keeps status `done`.
3. Update `client/data/ai-goal-preset.mjs::overlayPersistedActions` to detect thin completed `paper_watch`.
4. Downgrade that queue item to `manual` and append a note explaining that evidence is insufficient.
5. Preserve saved `href`, `relatedId`, and `updatedAt`.
6. Run `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`.

## Task Progress

* 2026-06-03
  * Step: Reopen thin completed paper watch in action queue.
  * Modifications: Added a regression test and updated persisted action overlay handling.
  * Change Summary: Thin completed paper watch actions now display as manual review in the visible queue.
  * Reason: Users should not see execution-readiness progress when paper evidence is missing.
  * Blockers: None.

## Final Review

Implementation matches the plan. The RED test failed with status `done`; after the overlay update, `node --test client/data/ai-goal-preset.test.mjs` passed with 133/133 tests. Frontend typecheck passed. Frontend lint exited 0 with the existing `client/data/use-activity-center.tsx` unused eslint-disable warning.
