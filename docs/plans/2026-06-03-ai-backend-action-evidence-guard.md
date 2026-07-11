# AI Backend Action Evidence Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent direct API patches from bypassing AI paper-review and execution-gate evidence requirements.

**Architecture:** The frontend already hides manual completion for blocked paper and gate actions, but the backend action patch normalizer is the authoritative API boundary. It now validates high-risk `done` transitions before storing run action memory.

**Tech Stack:** Go Echo handler helper, Mongo run action model, Go test.

## Analysis

`gateway/internal/http/handlers/ai_goal.go::normalizeAIGoalRunActionPatch` accepted any valid action id with any valid status. A client could directly patch `paper_watch` or `gate` to `done` with a thin note, bypassing the evidence contract enforced elsewhere in prompts and UI.

## Implementation Checklist

1. Add Go tests rejecting `paper_watch` `done` with a thin note.
2. Add Go tests allowing `paper_watch` `done` only when the note includes 24-72h, market, sentiment, human-bias, and execution-friction evidence.
3. Add Go tests rejecting `gate` `done` with a thin note.
4. Add Go tests allowing `gate` `done` only when the note includes kill switch, portfolio limits, trading gate, and paper review evidence.
5. Run focused Go tests and confirm RED failure.
6. Add backend helper checks in `normalizeAIGoalRunActionPatch`.
7. Run focused Go tests, full gateway tests, frontend helper tests, typecheck, lint, and `git diff --check`.

## Task Progress

* 2026-06-03
  * Step: Backend evidence guard for action patches.
  * Modifications: Added action patch tests and backend normalization guards.
  * Change Summary: Direct API updates can no longer mark paper watch or execution gate complete without evidence.
  * Reason: The project goal requires AI-assisted execution to stay evidence-gated even if a client bypasses the UI.
  * Blockers: None.

## Final Review

Implementation matches the plan. The RED tests failed because thin `paper_watch done` and `gate done` were accepted. After the guard update, focused action patch tests passed. Full gateway tests required local port permissions for `httptest`; rerun with approval passed.
