# Auth Next Query Preservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve query parameters, such as `?from=ai-draft`, when middleware redirects an unauthenticated user to `/login?next=...`.

**Architecture:** Add a small pure helper for protected-route next parameters and test it with Node's built-in test runner. Use that helper in `client/middleware.ts` so auth redirects keep `pathname + search` while root still omits `next`.

**Tech Stack:** Next.js middleware, JavaScript pure helper, `node --test`, TypeScript typecheck.

### Task 1: Pure Helper Test

**Files:**
- Create: `client/data/auth-redirect.test.mjs`
- Create: `client/data/auth-redirect.mjs`

**Step 1: Write failing test**

Add tests for `protectedNextParamFromUrl`:
- `/strategies/fake?from=ai-draft` returns `/strategies/fake?from=ai-draft`
- `/option?source=ai-goal&name=btca` returns `/option?source=ai-goal&name=btca`
- `/` returns an empty string

**Step 2: Run RED**

Run: `node --test client/data/auth-redirect.test.mjs`

Expected: FAIL because `auth-redirect.mjs` does not exist yet.

**Step 3: Implement helper**

Create `client/data/auth-redirect.mjs` with `protectedNextParamFromUrl(urlLike)`. It should build a `URL`, return `""` for `/`, and otherwise return `pathname + search`.

**Step 4: Run GREEN**

Run: `node --test client/data/auth-redirect.test.mjs`

Expected: PASS.

### Task 2: Middleware Integration

**Files:**
- Modify: `client/middleware.ts`

**Step 1: Import helper**

Import `protectedNextParamFromUrl` from `./data/auth-redirect.mjs`.

**Step 2: Use helper**

Replace `if (pathname !== "/") loginUrl.searchParams.set("next", pathname)` with:
`const next = protectedNextParamFromUrl(req.nextUrl); if (next) loginUrl.searchParams.set("next", next);`

### Task 3: Verification

Run:
- `node --test client/data/auth-redirect.test.mjs`
- `yarn typecheck`
- `git diff --check`
- HTTP route smoke for `/strategies/fake?from=ai-draft`, expecting `/login?next=%2Fstrategies%2Ffake%3Ffrom%3Dai-draft`
