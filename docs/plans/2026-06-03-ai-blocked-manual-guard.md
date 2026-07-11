# AI Blocked Manual Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent blocked AI paper and execution-gate actions from being manually marked complete.

**Architecture:** The AI Money action queue renders manual transition buttons from `manualActionTransition`. Blocked `paper_watch` and `gate` actions represent missing evidence or missing safety gates, so they should not expose a completion transition until upstream evidence changes their status to manual.

**Tech Stack:** Next.js helper module, Node test runner.

## Analysis

The default AI action queue now seeds `paper_watch` and `gate` as `blocked`, but `manualActionTransition` still returned completion transitions for those actions. The UI therefore could render a button that bypassed the AI paper-evidence gate.

## Implementation Checklist

1. Add tests in `client/data/ai-goal-preset.test.mjs` requiring blocked `paper_watch` and blocked `gate` to return `null`.
2. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED failure.
3. Update `client/data/ai-goal-preset.mjs::manualActionTransition` to return `null` for blocked `paper_watch` and `gate`.
4. Preserve manual `paper_watch` completion and done-state reopen behavior.
5. Run `node --test client/data/ai-goal-preset.test.mjs`, `yarn typecheck`, `yarn lint`, and `git diff --check`.

## Task Progress

* 2026-06-03
  * Step: Blocked manual guard.
  * Modifications: Updated manual transition tests and helper behavior.
  * Change Summary: Blocked paper/evidence gates no longer render manual completion transitions.
  * Reason: Prevent users from bypassing AI validation, paper observation, and execution-safety gates.
  * Blockers: None.

## Final Review

Implementation matches the plan. The RED test failed because blocked `paper_watch` still returned a completion transition. After the helper update, `node --test client/data/ai-goal-preset.test.mjs` passed with 133/133 tests. Frontend typecheck passed. Frontend lint exited 0 with the existing `client/data/use-activity-center.tsx` unused eslint-disable warning.
