# AI Money Client Unauthorized Next Implementation Plan

**Goal:** Preserve the current AI Money page when client-side authenticated API calls fail with 401/403, so re-login returns the user to the exact AI Money context.

**Architecture:** Add a pure `loginHrefForUrl()` helper that converts a current browser URL into `/login?next=...` using the existing safe next helpers. Then update `AuthRedirectListener` to use the current `window.location.href` instead of hard-coding `/login`.

**Tech Stack:** Next.js client component, plain `.mjs` auth redirect helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-client-unauthorized-next.md
Created On: 2026-06-03 12:30:22 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
AI Money can trigger authenticated API calls after the page has rendered. If the session expires, `api-client.ts` dispatches `auth:unauthorized`; `AuthRedirectListener` currently routes to plain `/login`, losing the current `/ai-money` path and query.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches frontend auth redirect helper tests and the client unauthorized listener.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/data/api-client.ts` dispatches `AuthUnauthorizedEvent` on browser 401/403 responses.

`client/components/auth-redirect-listener.tsx` listens for that event and currently calls `router.replace("/login")`.

`client/data/auth-redirect.mjs` already has `protectedNextParamFromUrl()` and `authHrefWithNext()`, which together can safely turn the current page into a login link with `next`.

# Proposed Solution

Add `loginHrefForUrl(urlLike)` to `client/data/auth-redirect.mjs`. It uses `protectedNextParamFromUrl()` and `authHrefWithNext("/login", next)` so root URLs still become `/login`, while AI Money URLs become `/login?next=...`.

Update `AuthRedirectListener` to call `router.replace(loginHrefForUrl(window.location.href))`.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/auth-redirect.test.mjs`

**Steps:**
- Import `loginHrefForUrl`.
- Assert `/ai-money?runId=goal_1` becomes `/login?next=%2Fai-money%3FrunId%3Dgoal_1`.
- Assert root URL becomes `/login`.
- Run `node --test client/data/auth-redirect.test.mjs` and confirm missing export failure.

### Task 2: Implement Helper

**Files:**
- Modify: `client/data/auth-redirect.mjs`

**Steps:**
- Add `loginHrefForUrl(urlLike)`.
- Reuse `protectedNextParamFromUrl()` and `authHrefWithNext()`.
- Run focused Node test and confirm pass.

### Task 3: Wire Client Unauthorized Listener

**Files:**
- Modify: `client/components/auth-redirect-listener.tsx`

**Steps:**
- Import `loginHrefForUrl`.
- Replace hard-coded `router.replace("/login")` with `router.replace(loginHrefForUrl(window.location.href))`.
- Update the listener comment to describe next preservation.

### Task 4: Verify

Run:

```bash
node --test client/data/auth-redirect.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: auth helper tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

Implementation Checklist:
1. Add failing tests for `loginHrefForUrl()`.
2. Run focused Node test and confirm missing export failure.
3. Implement `loginHrefForUrl()`.
4. Run focused Node test and confirm pass.
5. Update `AuthRedirectListener` to preserve current URL in login `next`.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:32:02 +0800
    *   Step: 1. Add failing tests for `loginHrefForUrl()`; 2. Run focused Node test and confirm missing export failure.
    *   Modifications: Added tests that current AI Money URLs become `/login?next=...` and root URLs become plain `/login`.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './auth-redirect.mjs' does not provide an export named 'loginHrefForUrl'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:32:02 +0800
    *   Step: 3. Implement `loginHrefForUrl()`; 4. Run focused Node test and confirm pass.
    *   Modifications: Added `loginHrefForUrl()` to `client/data/auth-redirect.mjs`, reusing `protectedNextParamFromUrl()` and `authHrefWithNext()`.
    *   Change Summary: GREEN confirmed with 13 passing auth redirect tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:32:02 +0800
    *   Step: 5. Update `AuthRedirectListener` to preserve current URL in login `next`; 6. Run Node test, typecheck, lint, and `git diff --check`; 7. Update Task Progress and Final Review in this document.
    *   Modifications: Updated the auth unauthorized listener to route to `loginHrefForUrl(window.location.href)` and verified tests/static checks.
    *   Change Summary: Client-side 401/403 events now preserve the current AI Money path/query for re-login.
    *   Reason: Executing plan steps 5-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-7 were completed. `loginHrefForUrl()` is covered by focused tests, and `AuthRedirectListener` now sends expired-session users to a login URL that preserves the current AI Money context.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.
