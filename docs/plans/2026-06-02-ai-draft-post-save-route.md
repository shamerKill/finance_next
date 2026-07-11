# AI Draft Post-Save Route Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After saving an AI-prefilled strategy draft, send the user directly to the created strategy detail page with a clear next-step callout.

**Architecture:** Keep the existing `POST /option` response contract. Type `createOption` on the frontend, add a pure redirect helper for AI draft saves, and render a one-time strategy detail callout when the redirect includes `from=ai-draft`.

**Tech Stack:** Next.js App Router, TypeScript, existing `ai-goal-preset.mjs` pure helper tests.

### Task 1: Redirect Helper

**Files:**
- Modify: `client/data/ai-goal-preset.test.mjs`
- Modify: `client/data/ai-goal-preset.mjs`

**Step 1: Write failing tests**

Add tests for `optionCreateRedirectHref`:
- AI preset + response id returns `/strategies/<id>?from=ai-draft`
- AI preset with missing id falls back to `/strategies`
- Manual create returns `/strategies`

**Step 2: Run test to verify RED**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: FAIL because `optionCreateRedirectHref` is not exported.

**Step 3: Implement helper**

Add `optionCreateRedirectHref({ isAIPreset, response })` near `parseStrategyPreset` helpers. It must URL-encode the id and return `/strategies` when not an AI preset or when no id is present.

**Step 4: Run test to verify GREEN**

Run: `node --test client/data/ai-goal-preset.test.mjs`

Expected: PASS.

### Task 2: Use Typed Create Response

**Files:**
- Modify: `client/data/type.d.ts`
- Modify: `client/data/api-client.ts`
- Modify: `client/app/(dashboard)/option/page.tsx`

**Step 1: Add response type**

Add `TypeCreateOptionResponse = { message: string; value: { id?: string; name: string } }`.

**Step 2: Type and harden `createOption`**

Change `createOption` to return `Promise<TypeCreateOptionResponse>` and use `jsonOrThrow<TypeCreateOptionResponse>(res)`.

**Step 3: Redirect after submit**

Import `optionCreateRedirectHref`, capture the `createOption(payload)` result, and call `router.push(optionCreateRedirectHref({ isAIPreset: aiPreset.isPreset, response }))`.

### Task 3: Strategy Detail Next-Step Callout

**Files:**
- Modify: `client/app/(dashboard)/strategies/[id]/page.tsx`

**Step 1: Accept search params**

Add `searchParams?: Promise<{ from?: string }>` to page props and read `from`.

**Step 2: Render AI draft callout**

When `from === "ai-draft"`, render a callout below the `PageHeader` saying the AI draft has been saved, live remains off, and the next steps are backtest/observe/bind account when ready.

### Task 4: Verification

Run:
- `node --test client/data/ai-goal-preset.test.mjs`
- `yarn typecheck`
- `git diff --check`
- HTTP route smoke for `/strategies/fake?from=ai-draft` and `/option?source=ai-goal...` under unauthenticated dev server.
