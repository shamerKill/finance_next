# AI Money Default Auth Destination Implementation Plan

**Goal:** Make AI Money the default authenticated landing destination when no explicit safe `next` destination is present.

**Architecture:** Reuse the existing auth redirect helper as the single source of truth for auth fallbacks, change its default fallback from `/dashboard` to `/ai-money`, and update the root page authenticated redirect to match.

**Tech Stack:** Next.js App Router, plain `.mjs` auth redirect helper, Node test runner.

# Context
Filename: 2026-06-03-ai-money-default-auth-destination.md
Created On: 2026-06-03 12:26:53 +0800
Created By: Codex
Associated Protocol: RIPER-5 + Multidimensional + Agent Protocol

# Task Description
AI Money is now the intended primary workspace. Current auth flow still falls back to `/dashboard` when no `next` is provided or when an unsafe `next` is rejected. The root page also redirects authenticated users to `/dashboard`. This makes users take an extra navigation step before using AI Money.

# Project Overview
`finance_next` is a monorepo with a Next.js frontend and Go gateway. This task only touches frontend auth routing helpers and the root page redirect.

---
*The following sections are maintained by the AI during protocol execution*
---

# Analysis

`client/data/auth-redirect.mjs` currently defaults `safeNextOrDefault()` and `authPageDestinationFromUrl()` to `/dashboard`.

`client/app/(auth)/login/page.tsx`, `register/page.tsx`, and `accept-invite/page.tsx` already call `safeNextOrDefault()` after success.

`client/middleware.ts` already calls `authPageDestinationFromUrl()` for cookie-present auth-page visits.

`client/app/page.tsx` redirects authenticated root visits to `/dashboard`.

# Proposed Solution

Add a helper constant `DEFAULT_AUTH_DESTINATION = "/ai-money"` in `client/data/auth-redirect.mjs` and use it as the default fallback for auth destination helpers. Keep explicit fallback arguments supported so callers can still override if needed.

Update `client/app/page.tsx` so authenticated root visits redirect to `/ai-money`.

# Implementation Plan

### Task 1: Add RED Tests

**Files:**
- Modify: `client/data/auth-redirect.test.mjs`

**Steps:**
- Assert empty and unsafe `safeNextOrDefault()` calls default to `/ai-money`.
- Assert unsafe `authPageDestinationFromUrl()` defaults to `/ai-money`.
- Assert explicit fallback override still works.
- Run `node --test client/data/auth-redirect.test.mjs` and confirm default fallback failure.

### Task 2: Update Auth Helper Defaults

**Files:**
- Modify: `client/data/auth-redirect.mjs`

**Steps:**
- Export `DEFAULT_AUTH_DESTINATION = "/ai-money"`.
- Use it as the default fallback for `safeNextOrDefault()` and `authPageDestinationFromUrl()`.
- Run focused Node test and confirm pass.

### Task 3: Update Root Landing Redirect

**Files:**
- Modify: `client/app/page.tsx`

**Steps:**
- Change authenticated root redirect from `/dashboard` to `/ai-money`.
- Update the nearby comment so it reflects the new AI Money landing behavior.

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
1. Add failing tests for default auth destination.
2. Run focused Node test and confirm `/dashboard` fallback failure.
3. Implement `DEFAULT_AUTH_DESTINATION = "/ai-money"` helper default.
4. Run focused Node test and confirm pass.
5. Update root authenticated redirect to `/ai-money`.
6. Run Node test, typecheck, lint, and `git diff --check`.
7. Update Task Progress and Final Review in this document.

# Current Execution Step
> Currently executing: "Complete."

# Task Progress

*   2026-06-03 12:28:40 +0800
    *   Step: 1. Add failing tests for default auth destination; 2. Run focused Node test and confirm `/dashboard` fallback failure.
    *   Modifications: Updated auth redirect tests so empty and unsafe destinations default to `/ai-money`, and added explicit fallback override coverage.
    *   Change Summary: RED confirmed with `SyntaxError: The requested module './auth-redirect.mjs' does not provide an export named 'DEFAULT_AUTH_DESTINATION'`.
    *   Reason: Executing plan steps 1-2.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:28:40 +0800
    *   Step: 3. Implement `DEFAULT_AUTH_DESTINATION = "/ai-money"` helper default; 4. Run focused Node test and confirm pass.
    *   Modifications: Added `DEFAULT_AUTH_DESTINATION` and used it as the default fallback for `safeNextOrDefault()` and `authPageDestinationFromUrl()`.
    *   Change Summary: GREEN confirmed with 11 passing auth redirect tests.
    *   Reason: Executing plan steps 3-4.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation
*   2026-06-03 12:28:40 +0800
    *   Step: 5. Update root authenticated redirect to `/ai-money`; 6. Run Node test, typecheck, lint, and `git diff --check`; 7. Update Task Progress and Final Review in this document.
    *   Modifications: Changed `client/app/page.tsx` authenticated root redirect from `/dashboard` to `/ai-money`, updated the comment, and verified tests/static checks.
    *   Change Summary: The app root and auth fallback now lead authenticated users directly into AI Money unless a safe explicit `next` says otherwise.
    *   Reason: Executing plan steps 5-7.
    *   Blockers: None.
    *   User Confirmation Status: Pending Confirmation

# Final Review

Implementation perfectly matches the final plan.

Checklist items 1-7 were completed. The auth redirect helper now defaults to `/ai-money`, explicit fallback overrides still work, and authenticated root visits redirect to `/ai-money`.

No unreported deviations were found. Browser runtime inspection was not performed because no callable in-app browser control tool was available in this session.
