# AI Operator Constraints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the AI money workflow accept explicit operator behavior constraints, market narrative focus, and avoid scenarios.

**Architecture:** Extend the frontend request helper to parse three newline/comma separated text fields into arrays. Extend the gateway request DTO, normalization, fallback analysis, and prompt builder so the AI provider receives these constraints as first-class input.

**Tech Stack:** Next.js React client, TypeScript declarations, plain ESM Node tests, Go Echo handler tests.

### Task 1: Add Frontend Helper Tests

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`

**Step 1: Write the failing test**

Add a test proving `aiGoalRequestFromFormState()` parses:
- `behaviorText` into `behaviorConstraints`
- `narrativeText` into `marketNarrativeFocus`
- `avoidText` into `avoidScenarios`

It should trim whitespace, split newline/comma/semicolon, remove duplicates, and cap each list.

**Step 2: Run RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because those request fields are not produced yet.

### Task 2: Add Gateway Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1: Write failing tests**

Add tests proving:
- `normalizeGoalRequest()` keeps and caps operator constraints.
- `buildGoalPrompt()` includes the operator constraints, market narrative focus, and avoid scenarios in the prompt.

**Step 2: Run RED**

Run: `go test ./internal/http/handlers -run 'TestAIGoalOperatorConstraints|TestBuildGoalPromptIncludesOperatorConstraints'`

Expected: FAIL because the request struct and prompt do not support the fields yet.

### Task 3: Implement Data Path

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/data/type.d.ts`
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1: Implement frontend parsing**

Add list parsing in `aiGoalRequestFromFormState()` and include the three fields only when non-empty.

**Step 2: Implement backend normalization and prompt sections**

Add request fields:
- `BehaviorConstraints []string`
- `MarketNarrativeFocus []string`
- `AvoidScenarios []string`

Normalize each with trimming, duplicate removal, length caps, and item caps. Print them in `buildGoalPrompt()`.

**Step 3: Include constraints in fallback**

Add operator constraints to fallback `humanFactors`, `watchSignals`, or `execution.safetyGates` so fallback mode still reflects the user's rules.

### Task 4: Render Form Inputs

**Files:**
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1: Add form state**

Add three text states with safe defaults:
- behavior/personality constraints
- market narrative focus
- avoid scenarios

**Step 2: Include fields in current/apply form state**

Wire the fields into `currentFormState()` and `applyFormState()`.

**Step 3: Render compact textareas**

Render them under risk/execution settings before the submit buttons.

### Task 5: Verify

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `go test ./internal/http/handlers -run 'TestAIGoalOperatorConstraints|TestBuildGoalPromptIncludesOperatorConstraints'`
- `yarn typecheck`
- `git diff --check`

Smoke `/ai-money` through the browser route if the dev server can be started.
