# AI Goal Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the user give a natural-language money-making goal, have AI analyze market context, human/sentiment factors, and generate strategy blueprints with execution gates.

**Architecture:** Add a gateway HTTP endpoint that gathers existing strategy state plus recent news, macro, and on-chain context, then calls the configured AI provider through the already-managed AI config and encrypted API keys. Add a primary dashboard page where the user enters a goal and reviews AI-generated thesis, strategy drafts, observation signals, and execution preflight steps. Keep order execution gates unchanged.

**Tech Stack:** Go/Echo gateway, Mongo `system_state.aiConfig`, Timescale news/macro/on-chain stores, Next.js App Router, HeroUI, existing dashboard components.

### Task 1: Gateway Goal-Agent Logic

**Files:**
- Create: `gateway/internal/http/handlers/ai_goal_test.go`
- Create: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Write failing tests**

Test pure helper behavior first:

- AI text extraction works for Anthropic, OpenAI Responses, and DeepSeek chat responses.
- malformed / non-JSON AI output falls back to a structured response instead of panicking.
- prompt context includes goal, symbols, recent news, macro snapshot, on-chain snapshot, and existing strategies.

Run:

```bash
cd gateway
go test ./internal/http/handlers -run 'TestAIGoal'
```

Expected before implementation: fails because helper functions do not exist.

**Step 2: Implement handler and helpers**

Create `AIGoalHandler` with:

- `POST /api/v1/ai/goals/analyze`
- request body: `goal`, `symbols`, `horizon`, `riskPreference`, `executionMode`
- response body: `summary`, `marketRead`, `humanFactors`, `strategyDrafts`, `watchSignals`, `execution`, `context`, `ai`

Helper functions:

- `normalizeGoalRequest`
- `buildGoalContext`
- `buildGoalPrompt`
- `callGoalAI`
- `parseGoalAIResponse`
- `fallbackGoalAnalysis`
- provider response extractors for Anthropic / OpenAI / DeepSeek

The handler should:

- require `system` repo for AI config;
- use encrypted Mongo API keys when present, with env fallback;
- tolerate missing Timescale or data rows by adding context notes;
- never create strategies or submit orders directly;
- mark `execution.canAutoExecute=false` when required gates are missing.

### Task 2: Router and API Client

**Files:**
- Modify: `gateway/internal/http/router.go`
- Modify: `client/data/api-client.ts`
- Modify: `client/data/type.d.ts`

**Step 1: Register endpoint**

Mount `NewAIGoalHandler(d.SystemRepo, d.OptionRepo, d.Timescale, d.Crypto, d.AIGoalRunRepo).Register(v1)` after the dashboard / AI config dependencies are available.

**Step 2: Add client types**

Add:

- `TypeAIGoalRequest`
- `TypeAIGoalAnalysis`
- `analyzeAIGoal(input)`

### Task 3: Frontend Goal Page

**Files:**
- Create: `client/app/(dashboard)/ai-money/page.tsx`
- Create: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Build usable page**

Render:

- goal input form with symbols, horizon, risk preference, execution mode;
- result sections for AI summary, market read, human factors, strategy drafts, watch signals, execution gates;
- data-source context notes so the user can see what AI actually considered;
- actions linking to AI settings, data ingestion, strategy creation, backtests, and recommendations.

### Task 4: Navigation

**Files:**
- Modify: `client/components/sidebar.tsx`
- Modify: `client/components/bottom-nav.tsx`
- Modify: `client/components/command-palette/items.ts`
- Modify: `client/data/route-labels.ts`

**Step 1: Make it easy to reach**

Add `/ai-money` as a primary AI goal-agent entry. Keep `/dashboard` as portfolio overview.

### Task 5: Verification

Run:

```bash
cd gateway
go test ./internal/http/handlers -run 'TestAIGoal'
go test ./internal/http/handlers

cd ../client
yarn lint
yarn typecheck
```

Review diff to confirm no automatic order submission or mainnet gate bypass was introduced.

Implementation Checklist:
1. Replace the old cockpit plan with this AI goal-agent plan.
2. Write failing Go tests for goal-agent helpers.
3. Implement `AIGoalHandler` helpers and endpoint.
4. Register the endpoint in router.
5. Add frontend API types and `analyzeAIGoal`.
6. Build `/ai-money` goal-agent page and client form.
7. Add navigation and command-palette entries.
8. Run focused Go tests.
9. Run broader handler tests.
10. Run frontend lint and typecheck.
11. Review diff for safety and scope.
