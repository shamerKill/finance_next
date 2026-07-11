# AI Paper Watch Note Preserve Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the AI-generated paper observation note when the user marks paper review complete.

**Architecture:** Keep the behavior in `manualActionTransition` so every UI that completes a paper watch action preserves the same AI context. Only append the completion evidence template to existing paper watch notes; do not change readiness gates or action statuses.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing assertion**

Add an assertion under `manualActionTransition only allows human checklist actions to advance`:

- Call `manualActionTransition` with `id = "paper_watch"`, `status = "manual"`, and a note containing an AI capital boundary such as `$200`, `$18`, and `4x`.
- Assert the returned note still includes the original capital boundary and includes the completion evidence phrase `24-72 小时复盘`.

**Step 2: Run focused test**

Run: `node --test --test-name-pattern "manualActionTransition" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the current transition note replaces the original note.

### Task 2: Implement Note Preservation

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add small helper**

Add `appendTransitionEvidenceNote(existingNote, completionNote)` near `manualActionTransition`.

- Trim whitespace
- Return completion note when existing note is blank
- Return existing note unchanged when it already includes completion note
- Otherwise return `existingNote + " " + completionNote`

**Step 2: Use helper for paper watch**

In the `id === "paper_watch"` branch, set `note` to the helper result.

### Task 3: Verify

**Step 1:** Run focused test.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `gateway`: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`.

**Step 4:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 5:** Run `git diff --check`.

### Execution Notes

- RED confirmed with focused `manualActionTransition` test: completing paper review dropped the original AI observation note and capital boundary.
- Added `appendTransitionEvidenceNote` and used it for the `paper_watch` manual completion transition.
- Completing paper review now preserves existing AI paper watch context and appends the required completion evidence template.
- Verified with focused tests, AI helper tests, Go handler tests, frontend typecheck, frontend lint, and `git diff --check`.
