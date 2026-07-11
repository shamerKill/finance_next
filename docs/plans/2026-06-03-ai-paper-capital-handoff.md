# AI Paper Capital Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI paper adoption handoff notes explicitly carry the AI-sized capital boundaries.

**Architecture:** Keep the behavior in the shared AI goal preset helpers so every UI entrypoint receives the same paper observation plan. Use explicit draft `riskCaps` only; do not invent fallback capital rules when the candidate has no AI risk caps.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Tests For Capital Handoff Evidence

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing assertions**

Extend `paperObservationPlanFromCandidate turns AI context into paper observation gates` with a candidate that has:

- `riskCaps.maxPositionUsd = 200`
- `riskCaps.maxLeverage = 4`
- `riskCaps.dailyLossCapUsd = 18`

Assert the returned plan includes a checklist or stop rule mentioning `$200`, `$18`, and `4x`.

Extend `paperWatchActionPatchFromCandidate persists the AI paper observation handoff` with the same risk caps and assert `patch.note` includes `$200`, `$18`, and `4x`.

**Step 2: Run focused tests to verify RED**

Run: `node --test --test-name-pattern "paperObservationPlanFromCandidate|paperWatchActionPatchFromCandidate" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because the plan and note do not yet include explicit capital boundaries.

### Task 2: Implement Capital Summary Helper

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add a small helper near paper observation code:

- Read `normalizeRiskCaps(candidate?.draft?.riskCaps)`
- Return empty string when no explicit risk caps exist
- Return `资金边界：paper 仓位不超过 $X，杠杆不超过 Nx，日亏损上限 $Y。`

**Step 2: Use helper in plan and note**

In `paperObservationPlanFromCandidate`, append the capital summary to the checklist when present.

In `paperWatchActionPatchFromCandidate`, append the capital summary to the stored note when present.

### Task 3: Verify

**Files:**
- Test: `client/data/ai-goal-preset.test.mjs`
- Test: `gateway/internal/http/handlers`
- Check: `client`

**Step 1:** Run focused tests.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `gateway`: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`.

**Step 4:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 5:** Run `git diff --check`.

### Execution Notes

- RED confirmed with focused Node tests: observation plan and paper watch note were missing `$200`, `$18`, and `4x`.
- Added `paperCandidateCapitalBoundary` to derive capital evidence only from explicit candidate `riskCaps`.
- Added the capital boundary to `paperObservationPlanFromCandidate().checklist` and `paperWatchActionPatchFromCandidate().note`.
- Verified with focused tests, AI helper tests, Go handler tests, frontend typecheck, frontend lint, and `git diff --check`.
