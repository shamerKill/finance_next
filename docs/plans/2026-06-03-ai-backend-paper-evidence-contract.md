# AI Backend Paper Evidence Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the backend AI goal agent with the product rule that AI may analyze, draft, and hand off strategy work, but testnet/mainnet cannot proceed until backtest plus 24-72 hour paper review evidence exists.

**Architecture:** The change stays inside the AI goal handler. The system prompt, user prompt, fallback analysis, default draft plans, safety gates, and persisted run actions will all describe the same evidence-gated sequence so frontend guidance and backend AI output cannot drift.

**Tech Stack:** Go 1.23, Echo handler tests, Mongo AI goal run action model.

### Task 1: Add failing tests for backend paper evidence contract

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Write failing tests**

Add assertions that:
- `goalAgentSystemPrompt()` output contract mentions `24-72h paper review evidence`.
- `buildGoalPrompt()` contains evidence-gated execution rules before testnet.
- `parseGoalAIResponse()` adds `paper review evidence` to safety gates and default draft plans.
- `fallbackGoalAnalysis()` includes paper review evidence in validation, execution, and safety text.
- `goalRunPreviewFromAnalysis()` seeds a `paper_watch` action and keeps the execution gate blocked until paper evidence is supplied.

**Step 2: Run focused test to verify failure**

Run:

```bash
cd gateway
go test ./internal/http/handlers -run 'AIGoal.*(Paper|Prompt|RunPreview|Malformed|NormalizesUnsafe)' -count=1
```

Expected: FAIL because the new evidence strings and default `paper_watch` action are not implemented yet.

### Task 2: Implement prompt and output-contract hardening

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Update `goalAIOutputContract`**

Change validation, execution, and safety gate examples to require:
- backtest,
- 24-72 hour paper observation,
- market direction / sentiment / human-bias / execution-friction review evidence,
- no testnet/mainnet promotion before evidence.

**Step 2: Update `goalAgentSystemPrompt()` and `buildGoalPrompt()` content**

Keep the existing system prompt shape, but ensure the contract text carries the new evidence rule. Add a user-prompt section named `Evidence-gated execution rules` that tells the AI:
- requested `testnet` or `mainnet` is an upper bound, not permission,
- before testnet it must require backtest plus paper review evidence,
- paper review evidence must cover market direction, sentiment/crowding, human bias, execution friction/slippage, and drawdown/profit behavior,
- thin `paper_watch done` notes remain unresolved.

### Task 3: Implement fallback/default safety semantics

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Update `ensureGoalSafetyGates()`**

Always add `paper review evidence` between `backtest` and `mainnet token gate`.

**Step 2: Update `fallbackGoalAnalysis()`**

Use validation and execution wording that requires 24-72 hour paper review evidence before testnet. Include the same Chinese review dimensions in fallback safety gates and next steps.

**Step 3: Update `normalizeGoalStrategyDrafts()` defaults**

When provider output omits draft plans, default validation/execution plans must include the paper evidence review before testnet.

### Task 4: Add default paper handoff action

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Update `defaultGoalRunActions()`**

Seed a `paper_watch` action when a tradable draft exists. Its status should be `blocked` until a backtest-derived paper plan patches it, with note text describing the required 24-72 hour paper review evidence. Keep `gate` blocked by default because testnet/mainnet remains unavailable without paper evidence.

### Task 5: Verify

**Files:**
- Verify only.

**Step 1: Run focused Go tests**

```bash
cd gateway
go test ./internal/http/handlers -run AIGoal -count=1
```

Expected: PASS.

**Step 2: Run broader gateway tests**

```bash
cd gateway
go test ./... -count=1
```

Expected: PASS, or report any unrelated pre-existing failure with exact output.

**Step 3: Run formatting/checks**

```bash
gofmt -w gateway/internal/http/handlers/ai_goal.go gateway/internal/http/handlers/ai_goal_test.go
git diff --check
```

Expected: no formatting or whitespace errors.
