# AI Source Run Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist the AI Money run id on saved strategy drafts so the strategy detail page can reopen the original AI goal, action queue, and market narrative trail without relying only on URL query parameters.

**Architecture:** The frontend includes `aiRunId` in the credentialless Option payload when an AI draft is saved. The gateway stores it as an optional `aiRunId` field on `Option`; the strategy detail page then falls back to this persisted field when the URL does not include `aiRunId`.

**Tech Stack:** Next.js App Router, TypeScript declaration types, Node test runner, Go domain DTOs, Echo handlers, MongoDB BSON tags.

### Task 1: Capture Desired Behavior With Failing Tests

**Files:**
- Modify: `gateway/internal/domain/option_test.go`
- Modify: `client/data/ai-goal-preset.test.mjs`

**Steps:**
1. Add a Go domain test proving `CreateOptionDTO` accepts and retains `AIRunID`.
2. Add a frontend helper test proving `optionPayloadFromStrategyDraft(..., { aiRunId })` includes `aiRunId`.
3. Add a frontend helper test proving `aiSavedStrategyHandoffFromState` links back to AI Money from `strategy.aiRunId`.
4. Run `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/domain` and confirm RED.
5. Run `node --test client/data/ai-goal-preset.test.mjs` and confirm RED.

### Task 2: Persist Source AI Run ID

**Files:**
- Modify: `gateway/internal/domain/option.go`
- Modify: `gateway/internal/http/handlers/option.go`
- Modify: `client/data/type.d.ts`
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Steps:**
1. Add optional `AIRunID` / `aiRunId` fields to create/update DTOs and persisted `Option`.
2. Copy `dto.AIRunID` into the created `domain.Option`.
3. Allow update requests to `$set` `aiRunId`.
4. Add optional `aiRunId` to `TypeOption`.
5. Let `optionPayloadFromStrategyDraft` accept an options object and include a trimmed source run id.
6. Pass `analysis?.id` into `optionPayloadFromStrategyDraft` when saving an AI strategy draft.
7. Re-run the targeted Go and Node tests and confirm GREEN.

### Task 3: Use Persisted Provenance In Strategy Detail

**Files:**
- Modify: `client/app/(dashboard)/strategies/[id]/page.tsx`

**Steps:**
1. Compute `sourceAiRunId` from `searchParams.aiRunId` first, then `strategy.aiRunId`.
2. Fetch `getAIGoalRun(sourceAiRunId)` best-effort when present.
3. Show the AI draft handoff when either `from=ai-draft` or a persisted `sourceAiRunId` exists.
4. Run typecheck and smoke checks for the detail route query preservation.

### Task 4: Verification

**Commands:**
- `GOCACHE=/Volumes/lin/code/my/finance_next/gateway/.tmp/go-build go test ./internal/domain ./internal/http/handlers`
- `node --test client/data/ai-goal-preset.test.mjs`
- `node --test client/data/auth-redirect.test.mjs`
- `cd client && yarn typecheck`
- `cd client && yarn lint`
- `git diff --check`
- HTTP smoke against local Next dev server for `/strategies/fake-id?from=ai-draft&aiRunId=goal+abc` and `/ai-money?runId=goal+abc`
