# AI Option Preset Run ID Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the source AI Money run when saving an AI-prefilled strategy from `/option`.

**Architecture:** Add a pure helper that appends `aiRunId` to AI strategy hrefs, parse that id in `parseStrategyPreset`, and include it in the `createOption` payload from the option form. The backend already supports `aiRunId`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner.

### Task 1: Add RED Coverage

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Test href run id helper**

Import and test `strategyHrefWithAIRunId`:

- Input: `/option?source=ai-goal&name=btca&orderGroupMargin=200`
- AI run id: `goal abc`
- Assert href contains `aiRunId=goal+abc`
- Assert existing params remain.

**Step 2: Test preset parsing**

Extend the existing preset parsing test to include `aiRunId=goal abc` and assert `parsed.aiRunId === "goal abc"`.

**Step 3: Run focused tests**

Run: `node --test --test-name-pattern "strategyPresetSearchFromDraft|strategyHrefWithAIRunId" client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `strategyHrefWithAIRunId` does not exist and parsing does not expose `aiRunId`.

### Task 2: Implement Helper And Parsing

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Add helper**

Add `strategyHrefWithAIRunId(href, aiRunId)`:

- Return original href if `aiRunId` is blank
- Use `new URL(href, "http://local")`
- Set `aiRunId`
- Return path + query for relative links
- Return original href if parsing fails

**Step 2: Parse aiRunId**

Add `aiRunId` to `DEFAULT_PRESET` and return `searchParams.get("aiRunId")` from `parseStrategyPreset`.

### Task 3: Wire The UI

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`
- Modify: `client/app/(dashboard)/option/page.tsx`

**Step 1: AI Money href**

In `acceptPaperCandidate`, use `strategyHrefWithAIRunId(candidate.strategyHref, analysis.id)` before saving `strategy.href` and before building the paper watch patch.

**Step 2: Option payload**

When creating `payload` in `/option`, include `aiRunId: aiPreset.aiRunId` if present.

### Task 4: Verify

**Step 1:** Run focused tests.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 3:** Run from `gateway`: `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`.

**Step 4:** Run from `client`: `yarn typecheck` and `yarn lint`.

**Step 5:** Run `git diff --check`.

## Execution Notes

**2026-06-03**

- RED confirmed with `node --test --test-name-pattern "strategyPresetSearchFromDraft" client/data/ai-goal-preset.test.mjs`: failed because `strategyHrefWithAIRunId` was not exported.
- GREEN confirmed with `node --test --test-name-pattern "strategyPresetSearchFromDraft" client/data/ai-goal-preset.test.mjs`: 2 tests passed.
- Full AI helper verification confirmed with `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`: 167 tests passed, 0 failed.
- Gateway handler verification confirmed with `env GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -count=1`: passed.
- Client type verification confirmed with `yarn typecheck`: passed.
- Client lint verification confirmed with `yarn lint`: exited 0 with the pre-existing warning in `client/data/use-activity-center.tsx:138`.
- Diff whitespace verification confirmed with `git diff --check`: passed.
