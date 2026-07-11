# AI Credentialless Strategy Draft Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an AI-generated strategy draft be saved without exchange API credentials, so the user can observe/backtest/paper-review the strategy first and bind an account only when enabling live execution.

**Architecture:** Keep the existing `options`/strategy collection and live execution gates. Make credentials optional at create time, encrypt them only when provided, and update the `/option` form so AI-prefilled drafts clearly support "save draft now, bind credentials later".

**Tech Stack:** Go domain DTO + Echo handler, Next.js client form, TypeScript shared types, Go tests and frontend type checks.

### Task 1: Backend DTO Allows Credentialless Drafts

**Files:**
- Modify: `gateway/internal/domain/option_test.go`
- Modify: `gateway/internal/domain/option.go`

**Step 1: Write failing test**

Add `TestCreateOptionDTOAllowsCredentiallessDraft` that builds a valid strategy with `Risk` but leaves `UserEmail`, `UserAPIKey`, and `UserSecretKey` empty. Validate with `validator.New(validator.WithRequiredStructEnabled())`.

**Step 2: Run test to verify RED**

Run: `go test ./internal/domain -run TestCreateOptionDTOAllowsCredentiallessDraft`

Expected: FAIL because the DTO still requires `userEmail`, `userApiKey`, and `userSecretKey`.

**Step 3: Implement DTO change**

Change create DTO tags:
- `UserEmail` from `validate:"required,email"` to `validate:"omitempty,email"`
- `UserAPIKey` and `UserSecretKey` from `validate:"required"` to no required validation.

**Step 4: Run domain tests**

Run: `go test ./internal/domain`

Expected: PASS.

### Task 2: Backend Encrypts Credentials Only When Provided

**Files:**
- Modify: `gateway/internal/http/handlers/option.go`

**Step 1: Implement conditional encryption**

In `create`, initialize `apiKeyEnc` and `secretEnc` to empty strings. Encrypt `dto.UserAPIKey` only when it is non-empty, and encrypt `dto.UserSecretKey` only when it is non-empty.

**Step 2: Run handler-adjacent tests**

Run: `go test ./internal/http/handlers -run AIGoal`

Expected: PASS, confirming nearby AI flow remains stable.

### Task 3: Frontend AI Preset Can Save Without Credentials

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`
- Modify: `client/data/type.d.ts`
- Modify: `client/app/(dashboard)/option/page.tsx`

**Step 1: Update shared type**

Make `userEmail`, `userApiKey`, and `userSecretKey` optional in `TypeOption`.

**Step 2: Update `/option` form copy and required flags**

Add `const credentialRequired = !aiPreset.isPreset;`.

For AI presets:
- Page subtitle should say AI drafts can be saved first and credentials bound later.
- AI callout should say credentials are optional for draft saving.
- Credential field labels should not be required.
- Inputs should not set `isRequired`.
- Submit button should say `保存 AI 草案`.

For non-AI manual strategy creation:
- Keep credential fields visually required and submit copy unchanged.

**Step 3: Build payload without blank credential fields**

Only spread `userEmail`, `userApiKey`, and `userSecretKey` into `payload` when their trimmed value is non-empty.

**Step 4: Run type check**

Run: `yarn typecheck` in `client/`.

Expected: PASS.

**Step 5: Update AI Money strategy creation summary**

Change `aiStrategyCreationSummaryFromDraft` copy so ready drafts say they can be saved first and credentials/accounts can be bound later. Tests should assert the ready summary no longer requires API keys before saving.

### Task 4: Final Verification

Run:
- `go test ./internal/domain`
- `go test ./internal/http/handlers -run AIGoal`
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `git diff --check`
- HTTP route smoke for `/option?source=ai-goal&name=btca&execSymbol=BTC&riskMaxPositionUsd=100&riskMaxLeverage=2&riskDailyLossCapUsd=10`
