# AI Run Deeplink Continuity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the source AI goal run when an AI-generated strategy draft is saved, so users can move between the saved strategy and the original AI decision queue.

**Architecture:** Add the source run id to the existing AI draft redirect URL, derive a source-run checklist item in the saved-strategy handoff helper, and let the AI Money page auto-open `?runId=` links. This keeps continuity in frontend state without adding new gateway endpoints.

**Tech Stack:** Next.js App Router, React client component, existing AI goal REST endpoint, Node test runner.

### Task 1: Add Tested URL Continuity

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Test: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write failing tests**

Add tests proving:

- `optionCreateRedirectHref({ runId })` returns `/strategies/:id?from=ai-draft&aiRunId=:runId`.
- `aiSavedStrategyHandoffFromState({ goalRun })` adds a `source_run` item linking to `/ai-money?runId=:runId`.

**Step 2: Run RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: fail because the source run is not preserved.

**Step 3: Implement helper behavior**

Add `aiMoneyRunHref(runId)`, update `optionCreateRedirectHref`, and add the optional source-run item to `aiSavedStrategyHandoffFromState`.

### Task 2: Wire Pages

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`
- Modify: `client/app/(dashboard)/strategies/[id]/page.tsx`

**Step 1: Save with run id**

Pass `analysis.id` into `optionCreateRedirectHref()` from `saveStrategyDraft()`.

**Step 2: Auto-open AI Money run**

Use `useSearchParams()` in `AIGoalClient` and auto-fetch/open `?runId=` once per requested id.

**Step 3: Fetch source run in strategy detail**

Read `searchParams.aiRunId`, fetch the run with `getAIGoalRun()`, and pass it into the saved strategy handoff helper.

### Task 3: Verify

Run:

```bash
node --test client/data/ai-goal-preset.test.mjs
node --test client/data/auth-redirect.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Smoke:

Start `yarn dev --hostname 127.0.0.1 --port 3000`, request `/strategies/fake-id?from=ai-draft&aiRunId=goal+abc` and `/ai-money?runId=goal+abc`, then stop the dev server and verify port 3000 is closed.
