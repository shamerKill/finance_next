# AI Goal Default Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist a default AI action checklist with every new AI goal run so a generated strategy has recoverable next steps before the user manually updates anything.

**Architecture:** Keep the analysis response unchanged, but seed `mongostore.AIGoalRunDoc.Actions` inside `goalRunPreviewFromAnalysis`. The actions mirror the frontend queue IDs already supported by the patch endpoint and UI: review, data, sentiment_review, backtest, strategy, and gate. The feature must not add execution permissions or submit orders.

**Tech Stack:** Go Echo handler helpers, Mongo run document shape, Go unit tests, existing frontend action IDs.

## Task 1: Write Failing Backend Test

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Add test**

Add a test near `TestAIGoalRunPreviewFromAnalysis`:

```go
func TestAIGoalRunPreviewSeedsDefaultActions(t *testing.T) {
	req := aiGoalAnalyzeRequest{
		Horizon:        "1-4 weeks",
		RiskPreference: "balanced",
		ExecutionMode:  "testnet",
	}
	analysis := aiGoalAnalysis{
		ID:        "goal_actions",
		CreatedAt: "2026-06-03T08:00:00Z",
		Goal:      "让 AI 自动分析 BTC 并给出策略",
		Summary:   "先回测再 paper。",
		HumanFactors: []string{
			"FOMO 追涨风险上升",
		},
		StrategyDrafts: []aiGoalStrategyDraft{
			{Name: "btca", Kind: "grid_dca", Symbol: "BTCUSDT"},
		},
		Context: aiGoalContextSummary{
			Symbols:      []string{"BTC"},
			NewsCount:    0,
			MacroCount:   1,
			OnchainCount: 1,
			Notes:        []string{"news: empty"},
		},
		Execution: aiGoalExecutionPlan{Mode: "testnet"},
		AI:        aiGoalMetadata{Status: "ok", Model: "claude-sonnet"},
	}

	preview := goalRunPreviewFromAnalysis(domain.DefaultUserID, analysis, req)

	if len(preview.Actions) != 6 {
		t.Fatalf("actions length = %d, want 6: %#v", len(preview.Actions), preview.Actions)
	}
	assertRunAction(t, preview.Actions, "review", "manual")
	assertRunAction(t, preview.Actions, "data", "blocked")
	assertRunAction(t, preview.Actions, "sentiment_review", "manual")
	assertRunAction(t, preview.Actions, "backtest", "ready")
	assertRunAction(t, preview.Actions, "strategy", "ready")
	assertRunAction(t, preview.Actions, "gate", "manual")
}
```

Add a helper if needed:

```go
func assertRunAction(t *testing.T, actions []mongostore.AIGoalRunAction, id, status string) {
	t.Helper()
	for _, action := range actions {
		if action.ID == id {
			if action.Status != status {
				t.Fatalf("action %s status = %q, want %q", id, action.Status, status)
			}
			if action.UpdatedAt.IsZero() {
				t.Fatalf("action %s missing updatedAt", id)
			}
			return
		}
	}
	t.Fatalf("action %s not found in %#v", id, actions)
}
```

**Step 2: Run RED**

Run:

```bash
cd gateway && GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestAIGoalRunPreviewSeedsDefaultActions
```

Expected: FAIL because preview actions are empty.

## Task 2: Implement Default Action Seeding

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Add helper**

Add:

```go
func defaultGoalRunActions(analysis aiGoalAnalysis) []mongostore.AIGoalRunAction
```

Rules:
- `review`: always `manual`, note mentions reviewing market, human factors, and risk caps.
- `data`: `blocked` if `analysis.Context.Notes` has entries; otherwise `done`.
- `sentiment_review`: `manual` when `analysis.HumanFactors` or `analysis.WatchSignals` has entries; otherwise `done`.
- `backtest`: `ready` when any non-watch strategy draft exists; otherwise `blocked`.
- `strategy`: `ready` when any non-watch strategy draft exists; otherwise `blocked`.
- `gate`: `manual` when `analysis.Execution.Mode` is `testnet` or `mainnet`; otherwise `blocked`.
- All actions use one shared `updatedAt` timestamp.
- `RelatedID` for backtest/strategy should be the first tradable draft name when present.

**Step 2: Use it in preview**

Set:

```go
Actions: defaultGoalRunActions(analysis),
```

inside `goalRunPreviewFromAnalysis`.

**Step 3: Run GREEN**

Run:

```bash
cd gateway && GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/http/handlers -run TestAIGoalRunPreviewSeedsDefaultActions
```

Expected: PASS.

## Task 3: Regression Verification

**Files:**
- No planned code changes.

Run:

```bash
cd gateway && GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./...
node --test client/data/ai-goal-preset.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected:
- Go tests pass.
- AI Money helper tests pass.
- Typecheck passes.
- Lint has no errors; the existing unrelated warning in `client/data/use-activity-center.tsx:138` may remain.
- Diff check passes.

## Task 4: Final Review

**Files:**
- Update: `docs/plans/2026-06-03-ai-goal-default-actions.md`

Append:
- RED/GREEN evidence.
- Verification command results.
- Confirmation that the change seeds only checklist state and does not execute trades.

## Task Progress

### 2026-06-03 02:14:04 CST

- Step: Task 1 - Write failing backend test.
- Modifications: Added `TestAIGoalRunPreviewSeedsDefaultActions` and `assertRunAction` in `gateway/internal/http/handlers/ai_goal_test.go`.
- Change Summary: The test requires new AI goal runs to start with six recoverable action states: review, data, sentiment_review, backtest, strategy, and gate.
- Reason: Executing plan Task 1 with TDD.
- Blockers: None. RED was confirmed because `preview.Actions` was empty.
- User Confirmation Status: Pending Confirmation.

### 2026-06-03 02:14:04 CST

- Step: Task 2 - Implement default action seeding.
- Modifications: Updated `gateway/internal/http/handlers/ai_goal.go` with `defaultGoalRunActions`, `firstGoalTradableDraft`, `minInt`, and wired `Actions` into `goalRunPreviewFromAnalysis`.
- Change Summary: Newly persisted AI goal runs now include initial checklist state derived from data gaps, human/sentiment pressure, tradable drafts, and requested execution mode.
- Reason: Executing plan Task 2.
- Blockers: None. Target handler test passed.
- User Confirmation Status: Pending Confirmation.

### 2026-06-03 02:14:04 CST

- Step: Task 3 - Regression verification and smoke.
- Modifications: No code changes from verification.
- Change Summary: Go tests, AI Money tests, auth redirect tests, typecheck, lint, diff check, and `/ai-money` route smoke were run.
- Reason: Executing plan Task 3.
- Blockers: Existing lint warning remains in `client/data/use-activity-center.tsx:138`.
- User Confirmation Status: Pending Confirmation.

## Final Review

Implementation matches the final plan. The change only seeds persisted checklist state for AI goal runs. It does not change the AI analysis response shape, does not add backend execution routes, does not toggle live trading, does not submit orders, and does not change mainnet gates. The default actions use IDs already accepted by the existing action patch endpoint and consumed by the existing AI Money UI.
