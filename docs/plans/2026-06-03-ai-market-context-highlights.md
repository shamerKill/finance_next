# AI Market Context Highlights Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI Money easier to observe by returning readable market context highlights from the AI goal backend and showing them in the AI market watchtower.

**Architecture:** Extend `aiGoalContextSummary` with a compact `marketContextHighlights` array derived from news, macro, and on-chain rows already gathered for the AI prompt. Map those highlights into existing AI Money watchtower signals so the current UI can show concrete evidence without adding a new panel.

**Tech Stack:** Go Echo handler tests, TypeScript type definitions, existing `client/data/ai-goal-preset.mjs` helper tests, Next.js client UI through existing helper state.

### Task 1: Backend RED test

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1:** Add `TestSummarizeGoalContextIncludesMarketContextHighlights`.

**Step 2:** Build an `aiGoalContext` with one news row, one macro point, and one on-chain point.

**Step 3:** Assert `summarizeGoalContext` exposes highlights containing `ETF inflows accelerate`, `FEDFUNDS`, and `hash_rate`.

**Step 4:** Run `go test ./internal/http/handlers -run 'TestSummarizeGoalContextIncludesMarketContextHighlights'`.

**Expected RED:** The test fails because `MarketContextHighlights` does not exist yet.

### Task 2: Frontend RED test

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1:** Add a test for `aiMarketWatchtowerFromState` with `analysis.context.marketContextHighlights`.

**Step 2:** Assert returned `signals` include a `news` signal with the provided evidence title and detail.

**Step 3:** Run `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'market context highlights'`.

**Expected RED:** The test fails because watchtower signals do not read `marketContextHighlights`.

### Task 3: Backend implementation

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1:** Add `aiGoalContextHighlight` with `id`, `source`, `label`, `detail`, and `at`.

**Step 2:** Add `MarketContextHighlights []aiGoalContextHighlight` to `aiGoalContextSummary`.

**Step 3:** Implement `summarizeGoalContextHighlights(goalCtx aiGoalContext)`.

**Step 4:** Call it from `summarizeGoalContext`.

**Step 5:** Re-run the backend focused test.

### Task 4: Frontend implementation

**Files:**
- Modify: `client/data/type.d.ts`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1:** Add `TypeAIGoalMarketContextHighlight`.

**Step 2:** Add `marketContextHighlights?: TypeAIGoalMarketContextHighlight[]` to `TypeAIGoalAnalysis.context`.

**Step 3:** Add helper logic that converts highlights into watchtower signals.

**Step 4:** Include those signals in `watchtowerSignalsFromAnalysis` before human-factor fallback signals.

**Step 5:** Re-run the frontend focused test.

### Task 5: Verify and review

**Files:**
- Modify: `docs/plans/2026-06-03-ai-market-context-highlights.md`

**Step 1:** Run `go test ./internal/http/handlers -run 'TestSummarizeGoalContextIncludesMarketContextHighlights|TestAIGoalPromptIncludesMarketAndHumanContext|TestParseGoalAIResponseBackfillsContextWatchSignals'` in `gateway/`.

**Step 2:** Run `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'market context highlights|aiMarketWatchtowerFromState'`.

**Step 3:** Run `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs`.

**Step 4:** Run `yarn typecheck` in `client/`.

**Step 5:** Run `yarn lint` in `client/`.

**Step 6:** Run `git diff --check`.

**Step 7:** Append task progress and final review.

Implementation Checklist:
1. Add backend failing test.
2. Run backend focused test and confirm RED.
3. Add frontend failing test.
4. Run frontend focused test and confirm RED.
5. Add backend highlight type and summary builder.
6. Wire backend highlights into `summarizeGoalContext`.
7. Add frontend highlight type.
8. Map highlights into watchtower signals.
9. Run backend focused verification.
10. Run frontend focused verification.
11. Run related Node helper tests.
12. Run `yarn typecheck`.
13. Run `yarn lint`.
14. Run `git diff --check`.
15. Update progress and final review.

# Task Progress

*   2026-06-03 09:07:53 CST
    *   Step: 1-2. Add backend failing test and confirm RED
    *   Modifications: Added `TestSummarizeGoalContextIncludesMarketContextHighlights` in `gateway/internal/http/handlers/ai_goal_test.go`.
    *   Change Summary: The test requires `summarizeGoalContext` to expose readable news, macro, and on-chain evidence highlights.
    *   Reason: Executing plan steps 1-2
    *   Blockers: Initial Go test command used the default user Library build cache and was blocked by sandbox; root cause was environment cache location, so verification was rerun with `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache`.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:07:53 CST
    *   Step: 3-4. Add frontend failing test and confirm RED
    *   Modifications: Added `aiMarketWatchtowerFromState surfaces market context highlights as observable signals` in `client/data/ai-goal-preset.test.mjs`.
    *   Change Summary: The test requires AI Money watchtower signals to show backend-provided market context highlights.
    *   Reason: Executing plan steps 3-4
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:07:53 CST
    *   Step: 5-6. Add backend highlight summary
    *   Modifications: Added `aiGoalContextHighlight`, `MarketContextHighlights`, `summarizeGoalContextHighlights`, and `goalHighlightTime` in `gateway/internal/http/handlers/ai_goal.go`.
    *   Change Summary: AI goal responses now include compact evidence highlights for the current news, macro, and on-chain rows already gathered for the AI prompt.
    *   Reason: Executing plan steps 5-6
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:07:53 CST
    *   Step: 7-8. Map highlights into the frontend watchtower
    *   Modifications: Added `TypeAIGoalMarketContextHighlight` and `context.marketContextHighlights` in `client/data/type.d.ts`; added `watchtowerContextSignalsFromAnalysis` and wired it into `watchtowerSignalsFromAnalysis` in `client/data/ai-goal-preset.mjs`.
    *   Change Summary: AI Money now shows concrete context evidence in the existing “AI 正在盯的信号” list before derived human/sentiment signals.
    *   Reason: Executing plan steps 7-8
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 09:07:53 CST
    *   Step: 9-14. Verify
    *   Modifications: Ran backend, frontend, type, lint, diff, and whitespace checks.
    *   Change Summary: `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-cache go test ./internal/http/handlers -run 'TestSummarizeGoalContextIncludesMarketContextHighlights|TestAIGoalPromptIncludesMarketAndHumanContext|TestParseGoalAIResponseBackfillsContextWatchSignals'` passed; sandboxed `go test ./...` failed only because sandbox disallowed `httptest` local port binding, then the same full command passed after approved escalation; `node --test client/data/ai-goal-preset.test.mjs --test-name-pattern 'market context highlights|aiMarketWatchtowerFromState'` passed; `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` passed 185/185; `yarn typecheck` passed; `yarn lint` passed with the existing `client/data/use-activity-center.tsx:138` unused eslint-disable warning; `git diff --check` passed; touched-file trailing whitespace scan returned no matches.
    *   Reason: Executing plan steps 9-14
    *   Blockers: None
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation matches the final plan. The backend now returns readable market context highlights, the frontend type model accepts them, and the AI Money watchtower surfaces them as observable signals. No unreported deviations were found.
