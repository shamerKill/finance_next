# AI Money Provider Readiness Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop AI Money from silently running fallback analysis when the active AI provider has no configured key, and guide the user to configure real AI first.

**Architecture:** Add a non-secret, read-only AI goal provider-status endpoint that reports whether the active provider can run real AI. The frontend consumes that endpoint, shows a top-of-page gate when blocked, and prevents automatic daily radar from starting until provider readiness is known.

**Tech Stack:** Go Echo handler tests, TypeScript API client, Next.js client component, Node test runner for small JS API helper behavior.

# Context
Filename: 2026-06-03-ai-money-provider-readiness-gate.md
Created On: 2026-06-03 11:57:27 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The user wants AI to receive a target, analyze market direction, human behavior, and public sentiment, then generate and execute safe strategies. AI Money already has workflow panels, but when the active provider is missing a key the user can still launch scans that fall back locally. That makes AI involvement look stronger than it is.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task touches the AI goal gateway handler, shared frontend API types/client, AI Money client, and focused tests.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis
Relevant files:

`gateway/internal/http/handlers/ai_goal.go` owns `/api/v1/ai/goals/*` routes and already has access to `SystemRepo.GetAIConfig()`.

`gateway/internal/http/handlers/admin.go` has `effectiveAIConfig()` in the same package, which can compute env + Mongo key presence without returning secrets.

`client/data/api-client.ts` is the single frontend fetch wrapper.

`client/data/type.d.ts` holds exported response types.

`client/app/(dashboard)/ai-money/client.tsx` currently starts auto daily radar once local preference and run state allow it. It does not know provider readiness before launching analysis.

# Proposed Solution
Add `GET /api/v1/ai/goals/provider-status` returning a small response:

```json
{
  "status": "ready | blocked",
  "tone": "success | warning",
  "providerFamily": "anthropic | openai | deepseek",
  "modelFamily": "claude | openai | deepseek",
  "providerLabel": "Anthropic | OpenAI | DeepSeek",
  "model": "...",
  "keyConfigured": true,
  "source": "mongo | env | mixed",
  "primaryHref": "/settings/ai",
  "primaryAction": { "kind": "open_link", "label": "配置真实 AI" },
  "summary": "...",
  "nextActions": ["..."]
}
```

The response exposes only booleans and public model metadata. It never returns plaintext keys or ciphertext.

On AI Money, fetch this status on mount. If it is blocked, render a warning callout before other AI action panels, disable auto daily radar, and route manual scan/analyze attempts to `/settings/ai` instead of producing fallback runs.

# Implementation Plan

### Task 1: Add RED Backend Tests

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal_test.go`

**Step 1:** Extend `fakeAIGoalSystemStore` with `cfg *domain.AIConfig` and `err error`, and make `GetAIConfig()` return them.

**Step 2:** Add `TestAIGoalProviderStatusReportsMissingActiveKey`:
- Clear `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`.
- Set `AI_MODEL_FAMILY=openai`.
- Register `AIGoalHandler`.
- Call `GET /api/v1/ai/goals/provider-status`.
- Expect `200`, `status=blocked`, `providerFamily=openai`, `keyConfigured=false`, `primaryHref=/settings/ai`.

**Step 3:** Add `TestAIGoalProviderStatusReportsPersistedDeepseekKey`:
- Use `domain.AIConfig{ModelFamily:"deepseek", DeepseekAPIKeyCiphertext:"cipher", DeepseekPrimaryModel:"deepseek-reasoner"}`.
- Expect `status=ready`, `providerFamily=deepseek`, `keyConfigured=true`, `model=deepseek-reasoner`, and no key/ciphertext fields in response.

**Step 4:** Run:

```bash
go test ./internal/http/handlers -run 'TestAIGoalProviderStatus' -count=1
```

Expected: FAIL because the route does not exist.

### Task 2: Implement Provider Status Endpoint

**Files:**
- Modify: `gateway/internal/http/handlers/ai_goal.go`

**Step 1:** Register `GET /ai/goals/provider-status`.

**Step 2:** Add small response structs and helper functions:
- `aiGoalProviderStatus(c echo.Context) error`
- `providerStatusFromEffectiveAIConfig(eff AIConfigEffective) aiGoalProviderStatusResponse`
- provider mapping for active family.

**Step 3:** Return 503 if `h.system == nil` or `GetAIConfig()` errors; otherwise return the non-secret status JSON.

**Step 4:** Re-run the focused Go tests and expect PASS.

### Task 3: Add Frontend API Type And Fetcher

**Files:**
- Modify: `client/data/type.d.ts`
- Modify: `client/data/api-client.ts`

**Step 1:** Add `TypeAIGoalProviderStatus`.

**Step 2:** Add `getAIGoalProviderStatus()`.

**Step 3:** Typecheck later in Task 5.

### Task 4: Gate AI Money UI And Auto Radar

**Files:**
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/app/(dashboard)/ai-money/client.tsx`

**Step 1:** Add failing tests for `aiProviderReadinessGateFromStatus()`:
- blocked provider status blocks manual analysis and auto radar, and links to `/settings/ai`;
- loading status blocks only auto radar while readiness is unknown;
- unknown non-loading status does not block the existing flow.

**Step 2:** Implement `aiProviderReadinessGateFromStatus()` in `client/data/ai-goal-preset.mjs`.

**Step 3:** Import `getAIGoalProviderStatus`, `TypeAIGoalProviderStatus`, and the helper.

**Step 4:** Add provider status state and a mount effect to fetch it.

**Step 5:** Add `providerGate` and use it to:
- prevent auto daily radar while status is loading or blocked,
- redirect `onAnalyzeAndValidate()` and `onDailyRadarScan()` to `/settings/ai` when blocked,
- render an `AIProviderReadinessGate` callout near the top of the right column.

**Step 6:** Keep endpoint errors non-blocking. If readiness cannot be fetched, existing analysis flow remains available.

### Task 5: Verify

Run:

```bash
go test ./internal/http/handlers -run 'TestAIGoalProviderStatus' -count=1
node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: focused Go tests pass, JS tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add backend failing tests for provider status.
2. Run focused Go test and confirm route-missing failure.
3. Implement provider status endpoint.
4. Run focused Go test and confirm pass.
5. Add frontend type and API fetcher.
6. Add provider readiness gate helper tests and implementation.
7. Gate AI Money UI, manual scans, and auto daily radar.
8. Run Go test, JS tests, typecheck, lint, and `git diff --check`.
9. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete"

# Task Progress

*   2026-06-03 11:59:30 +0800
    *   Step: 1. Add backend failing tests for provider status; 2. Run focused Go test and confirm route-missing failure.
    *   Modifications: Added provider-status handler tests for missing OpenAI key and persisted DeepSeek key; extended the fake system store to return AI config.
    *   Change Summary: RED confirmed with two `404 Not Found` failures for `/api/v1/ai/goals/provider-status`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:01:21 +0800
    *   Step: 3. Implement provider status endpoint; 4. Run focused Go test and confirm pass.
    *   Modifications: Registered `GET /ai/goals/provider-status`, added non-secret provider readiness response helpers, and formatted the Go handler/test files.
    *   Change Summary: GREEN confirmed with `go test ./internal/http/handlers -run 'TestAIGoalProviderStatus' -count=1`.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:06:44 +0800
    *   Step: 5. Add frontend type and API fetcher; 6. Add provider readiness gate helper tests and implementation; 7. Gate AI Money UI, manual scans, and auto daily radar.
    *   Modifications: Added `TypeAIGoalProviderStatus`, `getAIGoalProviderStatus()`, `aiProviderReadinessGateFromStatus()`, and AI Money client provider-status loading/gating UI.
    *   Change Summary: AI Money now waits for provider readiness before auto radar, routes blocked manual scans to `/settings/ai`, and displays a provider readiness callout when the active provider lacks a key.
    *   Reason: Executing plan steps 5-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:07:49 +0800
    *   Step: 8. Run Go test, JS tests, typecheck, lint, and `git diff --check`; 9. Update Task Progress and Final Review in this document.
    *   Modifications: Recorded final verification results and completed the final review.
    *   Change Summary: Focused Go provider-status tests passed; AI Money JS tests passed with 216 total tests; TypeScript check passed; lint exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`; `git diff --check` passed.
    *   Reason: Executing plan steps 8-9.
    *   Blockers: Browser runtime inspection was not performed because no callable in-app browser control tool was available in this environment.
    *   User Confirmation Status: Pending Confirmation

# Final Review
Implementation perfectly matches the final plan.

Checklist verification:

1. Backend failing tests were added for provider status.
2. RED was confirmed with `404 Not Found` for `/api/v1/ai/goals/provider-status`.
3. The provider status endpoint was implemented.
4. Focused Go provider-status tests passed.
5. Frontend type and API fetcher were added.
6. Provider readiness gate helper tests and implementation were added.
7. AI Money UI, manual scans, and auto daily radar were gated by provider readiness.
8. Verification completed: `go test ./internal/http/handlers -run 'TestAIGoalProviderStatus' -count=1` passed; `node --test client/data/ai-goal-preset.test.mjs client/data/ai-settings-workflow.test.mjs` reported 216 passing tests; `yarn typecheck` passed; `yarn lint` exited 0 with the known existing warning in `client/data/use-activity-center.tsx:138`; `git diff --check` passed.
9. Task Progress and Final Review were updated.

No unreported deviations were detected. Runtime browser inspection remains unverified because no callable in-app browser control tool was available.
