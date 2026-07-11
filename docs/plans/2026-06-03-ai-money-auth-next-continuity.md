# AI Money Auth Next Continuity Implementation Plan

**Goal:** Preserve the intended AI Money destination across login, registration, invite registration links, and already-authenticated auth-page visits so a user redirected from `/ai-money` stays on the AI Money setup path after authentication.

**Architecture:** Move duplicated auth `next` sanitisation into `client/data/auth-redirect.mjs`, add small helpers for auth-page links and auth-page redirect destinations with safe `next` propagation, then reuse them from login/register/accept-invite pages and middleware.

**Tech Stack:** Next.js client auth pages, plain `.mjs` helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-auth-next-continuity.md
Created On: 2026-06-03 12:19:44 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
The in-app browser is currently at `/login?next=%2Fai-money`. Login honours `next`, but the auth-page links to register and accept-invite drop it. This adds friction for first-time AI Money users: after following registration flows they can land on `/dashboard` instead of returning to `/ai-money`.

An additional continuity gap exists for already-authenticated users: `/login?next=/ai-money` is currently whitelisted by middleware and then the auth layout redirects to `/dashboard`, also losing the intended AI Money destination.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches frontend auth route helpers and auth pages.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/middleware.ts` already preserves protected destinations with `protectedNextParamFromUrl()`.

`client/app/(auth)/login/page.tsx`, `register/page.tsx`, and `accept-invite/page.tsx` each duplicate `safeNextOrDashboard()`.

`login/page.tsx` and `register/page.tsx` route submit success to the safe `next`, but their cross-links use plain `/register`, `/accept-invite`, and `/login`, which loses the destination.

`accept-invite/page.tsx` also routes submit success to the safe `next`, but its login link loses the destination.

`client/middleware.ts` whitelists auth pages before checking cookie presence, so authenticated auth-page visits cannot honour `next` before `client/app/(auth)/layout.tsx` sends the user to `/dashboard`.

# Proposed Solution

Add `safeNextOrDefault(raw, fallback = "/dashboard")`, `authHrefWithNext(pathname, rawNext)`, and `authPageDestinationFromUrl(urlLike, fallback = "/dashboard")` to `client/data/auth-redirect.mjs`. Keep the same same-origin relative-path guard: allow `/path?...`, reject empty, absolute URLs, and protocol-relative URLs.

Use `safeNextOrDefault()` for successful auth redirects and `authHrefWithNext()` for auth-page cross-links. Use `authPageDestinationFromUrl()` in middleware when an auth cookie is already present on `/login`, `/register`, or `/accept-invite`. This keeps `/ai-money` continuity without weakening open-redirect protection.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/auth-redirect.test.mjs`

**Steps:**
- Import `safeNextOrDefault` and `authHrefWithNext`.
- Add tests that safe `/ai-money` is preserved.
- Add tests that absolute/protocol-relative destinations fall back to `/dashboard`.
- Add tests that auth links encode safe `next` and omit unsafe `next`.
- Run `node --test client/data/auth-redirect.test.mjs` and confirm missing export failure.

### Task 2: Implement Shared Helpers

**Files:**
- Modify: `client/data/auth-redirect.mjs`

**Steps:**
- Add `safeNextOrDefault(raw, fallback = "/dashboard")`.
- Add `authHrefWithNext(pathname, rawNext)`.
- Keep `protectedNextParamFromUrl()` behaviour unchanged.
- Run focused Node test and confirm pass.

### Task 3: Reuse Helpers In Auth Pages

**Files:**
- Modify: `client/app/(auth)/login/page.tsx`
- Modify: `client/app/(auth)/register/page.tsx`
- Modify: `client/app/(auth)/accept-invite/page.tsx`

**Steps:**
- Import `safeNextOrDefault` and `authHrefWithNext`.
- Remove duplicated local `safeNextOrDashboard()`.
- Use `safeNextOrDefault(search?.get("next"))` for successful auth redirects.
- Use `authHrefWithNext()` for login/register/accept-invite cross-links.

### Task 4: Verify

Run:

```bash
node --test client/data/auth-redirect.test.mjs
cd client && yarn typecheck
cd client && yarn lint
git diff --check
```

Expected: helper tests pass, typecheck passes, lint exits 0 with the known existing warning in `client/data/use-activity-center.tsx:138`, and diff check passes.

### Task 5: Preserve Authenticated Auth-Page Next

**Files:**
- Modify: `client/data/auth-redirect.test.mjs`
- Modify: `client/data/auth-redirect.mjs`
- Modify: `client/middleware.ts`

**Steps:**
- Add tests for `authPageDestinationFromUrl()` preserving safe `/ai-money` and rejecting unsafe destinations.
- Implement `authPageDestinationFromUrl()`.
- In middleware, compute cookie presence before auth-page whitelist; when an auth page has a cookie, redirect to the safe auth-page destination.
- Re-run focused auth tests, typecheck, lint, and `git diff --check`.

Implementation Checklist:
1. Add failing auth next continuity tests.
2. Run focused Node test and confirm missing export failure.
3. Implement shared auth next helpers.
4. Run focused Node test and confirm pass.
5. Replace duplicated auth-page redirect helpers.
6. Preserve `next` in login/register/accept-invite cross-links.
7. Run Node test, typecheck, lint, and `git diff --check`.
8. Update Task Progress and Final Review in this document.
9. Add failing tests for authenticated auth-page `next` destinations.
10. Implement `authPageDestinationFromUrl()`.
11. Use the helper in middleware for cookie-present auth-page visits.
12. Re-run Node test, typecheck, lint, and `git diff --check`.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:22:11 +0800
    *   Step: 1. Add failing auth next continuity tests; 2. Run focused Node test and confirm missing export failure.
    *   Modifications: Added tests for `safeNextOrDefault()` and `authHrefWithNext()` covering safe AI Money paths, unsafe absolute/protocol-relative URLs, and auth-page link encoding.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './auth-redirect.mjs' does not provide an export named 'authHrefWithNext'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:22:11 +0800
    *   Step: 3. Implement shared auth next helpers; 4. Run focused Node test and confirm pass.
    *   Modifications: Added `safeNextOrDefault()` and `authHrefWithNext()` to `client/data/auth-redirect.mjs`.
    *   Change Summary: GREEN confirmed with 7 passing auth redirect tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:22:11 +0800
    *   Step: 5. Replace duplicated auth-page redirect helpers; 6. Preserve `next` in login/register/accept-invite cross-links.
    *   Modifications: Updated login, register, and accept-invite pages to import the shared helpers, use safe redirect destinations after auth success, and keep safe `next` values on cross-links.
    *   Change Summary: Users redirected to `/login?next=/ai-money` can switch to registration or invite flows without losing the AI Money destination.
    *   Reason: Executing plan steps 5-6.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:22:11 +0800
    *   Step: 7. Run Node test, typecheck, lint, and `git diff --check`; 8. Update Task Progress and Final Review in this document.
    *   Modifications: Verified the auth helper tests, frontend typecheck, frontend lint, and whitespace diff validation; updated this execution record and final review.
    *   Change Summary: Verification passed. Lint still reports only the known existing warning in `client/data/use-activity-center.tsx:138`.
    *   Reason: Executing plan steps 7-8.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:23:34 +0800
    *   Step: 9. Add failing tests for authenticated auth-page `next` destinations; 10. Implement `authPageDestinationFromUrl()`.
    *   Modifications: Added `authPageDestinationFromUrl()` tests and helper implementation.
    *   Change Summary: RED confirmed with missing export failure, then GREEN confirmed with 9 passing auth redirect tests.
    *   Reason: Executing plan steps 9-10.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:23:34 +0800
    *   Step: 11. Use the helper in middleware for cookie-present auth-page visits; 12. Re-run Node test, typecheck, lint, and `git diff --check`.
    *   Modifications: Updated `client/middleware.ts` so authenticated visits to `/login`, `/register`, and `/accept-invite` honour safe `next` destinations before falling back to `/dashboard`; verified tests and static checks.
    *   Change Summary: Already-authenticated visits to `/login?next=/ai-money` now redirect to `/ai-money` instead of losing context.
    *   Reason: Executing plan steps 11-12.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-12 were completed. The auth destination helpers preserve safe AI Money paths, reject unsafe redirects, and the login/register/accept-invite pages now keep `next` continuity across their cross-links and successful auth redirects. Middleware also preserves safe `next` destinations for already-authenticated auth-page visits.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.
